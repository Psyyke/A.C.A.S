"""Paired autonomous games against unchanged Maia 3, not an Elo assessment."""

import argparse
import csv
import json
from pathlib import Path

import chess
import chess.pgn
import numpy as np
import onnxruntime as ort
import torch

from native_study import MOVES, canonical_move, encode, feeds, session


def samples_from(boards: list[chess.Board]) -> list[dict]:
    result = []
    for board in boards:
        legal = [move.uci() for move in board.legal_moves]
        result.append({"fen": board.fen(), "move": legal[0], "legalMoves": legal})
    return result


def policy(runtime: ort.InferenceSession, boards: list[chess.Board], prepared: bool) -> np.ndarray:
    tokens, legal, _ = encode(samples_from(boards))
    name = "acas_base_logits" if prepared else "logits_move"
    values = runtime.run([name], feeds(tokens, 2000))[0]
    values = np.where(legal, values, -1e9)
    values -= values.max(axis=1, keepdims=True)
    exp = np.exp(values)
    return exp / exp.sum(axis=1, keepdims=True)


def choose(board: chess.Board, distribution: np.ndarray, random: np.random.Generator | None) -> chess.Move:
    moves = list(board.legal_moves)
    probabilities = np.array([distribution[MOVES[canonical_move(move.uci(), not board.turn)]] for move in moves])
    index = int(probabilities.argmax()) if random is None else int(random.choice(len(moves), p=probabilities / probabilities.sum()))
    return moves[index]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    parser.add_argument("--games", type=int, default=32)
    parser.add_argument("--plies", type=int, default=100)
    args = parser.parse_args()
    if args.games < 2 or args.games % 2 or args.plies < 2:
        parser.error("Use an even number of games and at least two rollout plies")
    if not torch.cuda.is_available():
        raise RuntimeError("Rollouts require native CUDA")
    ort.preload_dlls()
    base = session(args.study / "maia3-features.onnx", True)
    random = np.random.default_rng(8801)
    openings = [chess.Board() for _ in range(args.games // 2)]
    for _ in range(8):
        output = policy(base, openings, True)
        for i, board in enumerate(openings):
            board.push(choose(board, output[i], random))
    names = ["base2000", "anchor0", "anchor0.5", "anchor0.8"]
    models = {"base2000": base}
    for name in names[1:]:
        models[name] = session(args.study / f"knightfan-2000-{name}.onnx", True)
    rows, summaries = [], {}
    for name, runtime in models.items():
        boards = [opening.copy() for opening in openings for _ in range(2)]
        counts = [{"opportunities": 0, "knightChoices": 0, "moves": 0} for _ in boards]
        for ply in range(args.plies):
            active = [i for i, board in enumerate(boards) if not board.is_game_over(claim_draw=True)]
            if not active:
                break
            groups = {
                learner: [i for i in active if (boards[i].turn == (i % 2 == 0)) == learner]
                for learner in [False, True]
            }
            for learner in [False, True]:
                group = groups[learner]
                if not group:
                    continue
                chosen_runtime = runtime if learner else base
                distributions = policy(chosen_runtime, [boards[i] for i in group], chosen_runtime is base)
                for j, i in enumerate(group):
                    board = boards[i]
                    move = choose(board, distributions[j], None)
                    legal = list(board.legal_moves)
                    knight = board.piece_type_at(move.from_square) == chess.KNIGHT
                    choices = [board.piece_type_at(item.from_square) == chess.KNIGHT for item in legal]
                    opportunity = any(choices) and not all(choices)
                    if learner:
                        counts[i]["moves"] += 1
                        counts[i]["opportunities"] += int(opportunity)
                        counts[i]["knightChoices"] += int(opportunity and knight)
                    rows.append({"model": name, "game": i, "ply": ply, "learner": learner,
                                 "fen": board.fen(), "move": move.uci(), "knightOpportunity": opportunity,
                                 "knightChoice": knight})
                    board.push(move)
        games, results = [], []
        for i, board in enumerate(boards):
            game = chess.pgn.Game.from_board(board)
            game.headers.update({"Event": "DoppelMaia autonomous style check",
                                 "White": name if i % 2 == 0 else "BaseMaia2000",
                                 "Black": "BaseMaia2000" if i % 2 == 0 else name})
            outcome = board.outcome(claim_draw=True)
            if outcome:
                game.headers["Result"] = outcome.result()
            else:
                game.headers["Result"] = "*"
            score = None if outcome is None else 0.5 if outcome.winner is None else float(outcome.winner == (i % 2 == 0))
            results.append({"game": i, **counts[i], "score": score,
                            "termination": str(outcome.termination) if outcome else "ply limit",
                            "result": game.headers["Result"]})
            games.append(str(game))
        opportunities = sum(row["opportunities"] for row in results)
        summaries[name] = {"games": args.games, "knightOpportunities": opportunities,
                           "knightChoiceRate": sum(row["knightChoices"] for row in results) / opportunities,
                           "finished": sum(row["score"] is not None for row in results),
                           "wins": sum(row["score"] == 1 for row in results),
                           "draws": sum(row["score"] == 0.5 for row in results),
                           "losses": sum(row["score"] == 0 for row in results),
                           "truncated": sum(row["score"] is None for row in results), "details": results}
        (args.study / f"rollout-{name}.pgn").write_text("\n\n".join(games), encoding="utf-8")
        print(name, json.dumps({key: value for key, value in summaries[name].items() if key != "details"}), flush=True)
    (args.study / "rollout-report.json").write_text(json.dumps({
        "protocol": {"gamesPerModel": args.games, "rolloutPlies": args.plies, "openingPlies": 8,
                     "openingSeed": 8801, "sameOpeningsAndBothColors": True,
                     "choice": "Greedy legal top one for both sides", "opponent": "Unchanged Maia 3 at conditioning 2000",
                     "warning": "Conditioning 2000 is not a measured Elo and incomplete games are not draws"},
        "models": summaries
    }, indent=2))
    with (args.study / "rollout-moves.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
