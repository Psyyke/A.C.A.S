"""Play autonomous games for all preset adapters, with paired base controls."""

import argparse
import hashlib
import json
from pathlib import Path

import chess
import chess.pgn
import numpy as np
import onnxruntime as ort
import torch

from imitation_study import softmax
from native_study import MOVES, canonical_move, encode, feeds, session


OPENINGS = ["e4 e5 Nf3 Nc6", "d4 d5 c4 e6", "c4 e5 Nc3 Nf6", "Nf3 d5 g3 c5"]
FRESH_OPENINGS = ["e4 e6 d4 d5", "e4 c5 Nf3 d6", "e4 c6 d4 d5",
                  "d4 Nf6 c4 g6", "d4 d5 c4 c6", "d4 f5 c4 Nf6"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    parser.add_argument("--plies", type=int, default=80)
    parser.add_argument("--selection", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--fresh-openings", action="store_true")
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required")
    torch.set_num_threads(8)
    ort.preload_dlls()
    study = json.loads((args.study / "personality-report.json").read_text())
    output = args.output or args.study
    output.mkdir(parents=True, exist_ok=True)
    profiles = study["profiles"]
    selection_sha = None
    if args.selection:
        raw = args.selection.read_bytes()
        selection = json.loads(raw)
        if selection["confirmed"]:
            raise ValueError("Use the original discovery report, before fresh results were examined")
        selected = set(selection["discoverySelected"])
        profiles = [profile for profile in profiles if profile["id"] in selected]
        if not selected or len(profiles) != len(selected):
            raise ValueError("Selection contains no profiles or unknown profiles")
        for profile in profiles:
            expected = next(row for row in selection["profiles"] if row["id"] == profile["id"])
            if profile["configuration"] != expected["configuration"]:
                raise ValueError("A discovered personality configuration changed")
            adapter = args.study / f"{profile['id']}-adapter.npz"
            if hashlib.sha256(adapter.read_bytes()).hexdigest() != selection["source"]["adaptersSHA256"][profile["id"]]:
                raise ValueError("A discovered personality adapter changed")
        if selection["source"]["practiceSHA256"] != study["practiceSHA256"]:
            raise ValueError("Discovery and rollout practice sources differ")
        selection_sha = hashlib.sha256(raw).hexdigest()
        (output / "discovery-selection.json").write_bytes(raw)
    model_path = args.study / "maia3-personality-features.onnx"
    if hashlib.sha256(model_path.read_bytes()).hexdigest() != study["preparedSHA256"]:
        raise ValueError("Rollout feature model changed since training")
    runtime = session(model_path, True)
    openings = FRESH_OPENINGS if args.fresh_openings else OPENINGS
    count = len(openings) * 2
    report = {"protocol": {"gamesPerPreset": count, "baseControlGamesPerPreset": count, "maximumNewPlies": args.plies,
                           "selection": "Greedy legal move, as in the one-node app checks",
                           "openings": openings, "bothColors": True,
                           "freshOpenings": args.fresh_openings, "discoverySHA256": selection_sha,
                           "preparedSHA256": study["preparedSHA256"], "practiceSHA256": study["practiceSHA256"],
                           "limitation": "Autonomous behavior on paired openings, not an Elo tournament"},
              "profiles": []}
    for profile in profiles:
        with np.load(args.study / f"{profile['id']}-adapter.npz") as saved:
            matrix, bias = saved["matrix"], saved["bias"]
        boards, records, owners = [], [], []
        for control in [False, True]:
            for line in openings:
                for color in [chess.WHITE, chess.BLACK]:
                    board = chess.Board()
                    for san in line.split():
                        board.push_san(san)
                    boards.append(board)
                    records.append([])
                    owners.append((color, control))
        for _ in range(args.plies):
            active = [i for i, board in enumerate(boards) if not board.is_game_over(claim_draw=True)]
            if not active:
                break
            samples = [{"fen": boards[i].fen(), "legalMoves": [move.uci() for move in boards[i].legal_moves],
                        "move": next(iter(boards[i].legal_moves)).uci()} for i in active]
            tokens, legal, _ = encode(samples)
            base, features = runtime.run(["acas_base_logits", "acas_features"], feeds(tokens, profile["elo"]))
            personal = base + features @ matrix + bias
            base_p, personal_p = softmax(base, legal), softmax(personal, legal)
            for row, i in enumerate(active):
                board, (owner, control) = boards[i], owners[i]
                use_personal = board.turn == owner and not control
                p = personal_p[row] if use_personal else base_p[row]
                move = max(board.legal_moves, key=lambda move: p[MOVES[canonical_move(move.uci(), not board.turn)]])
                if board.turn == owner:
                    indices = [MOVES[canonical_move(uci, not board.turn)] for uci in samples[row]["legalMoves"]]
                    records[i].append({"fen": board.fen(), "move": move.uci(), "control": control,
                                       "gameId": f"{profile['id']}-{i}", "opening": (i % count) // 2,
                                       "playerColor": "white" if owner else "black",
                                       "legalMoves": samples[row]["legalMoves"],
                                       "base": base_p[row, indices].tolist(), "personal": personal_p[row, indices].tolist()})
                board.push(move)
        outcomes = {"personal": {"wins": 0, "draws": 0, "losses": 0, "unfinished": 0},
                    "base": {"wins": 0, "draws": 0, "losses": 0, "unfinished": 0}}
        pgns = []
        for i, board in enumerate(boards):
            owner, control = owners[i]
            outcome = board.outcome(claim_draw=True)
            label = "base" if control else "personal"
            key = "unfinished" if outcome is None else "draws" if outcome.winner is None else "wins" if outcome.winner == owner else "losses"
            outcomes[label][key] += 1
            game = chess.pgn.Game.from_board(board)
            game.headers.update({"Event": f"DoppelMaia {profile['id']} {label}", "White": "Personal" if owner else "Base",
                                 "Black": "Base" if owner else "Personal", "Result": board.result(claim_draw=True)})
            pgns.append(str(game))
        (output / f"{profile['id']}-games.pgn").write_text("\n\n".join(pgns))
        (output / f"{profile['id']}-rollout-moves.json").write_text(json.dumps(sum(records, [])))
        report["profiles"].append({"id": profile["id"], "elo": profile["elo"], "outcomes": outcomes,
                                   "ownMoves": sum(len(rows) for rows in records)})
        (output / "personality-rollouts.json").write_text(json.dumps(report, indent=2))
        print(profile["id"], outcomes, flush=True)


if __name__ == "__main__":
    main()
