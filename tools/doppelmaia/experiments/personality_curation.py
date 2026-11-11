"""Curate recognizable behavior, not a preset quota, and verify on fresh games."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess

import chess
import chess.pgn
import numpy as np
import torch

from finetune_study import save_json
from native_study import MOVES, canonical_move, encode, paired_interval


THRESHOLDS = {"baseJS": 0.025, "baseTopMoveDisagreement": 0.2,
              "pairJS": 0.02, "pairTopMoveDisagreement": 0.15,
              "pairDisagreementLower95": 0.1, "positiveOpeningFraction": 0.75}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rollout_signatures(study, output, label):
    rollouts = json.loads((study / "personality-rollouts.json").read_text())
    openings = rollouts["protocol"]["openings"]
    count = len(openings) * 2
    result = {"source": {}, "profiles": []}
    for profile in rollouts["profiles"]:
        identifier = profile["id"]
        pgn_path = study / f"{identifier}-games.pgn"
        moves_path = study / f"{identifier}-rollout-moves.json"
        result["source"][identifier] = {"pgnSHA256": digest(pgn_path), "movesSHA256": digest(moves_path)}
        stream = io.StringIO(pgn_path.read_text())
        records = json.loads(moves_path.read_text())
        games, offset = [], 0
        while (game := chess.pgn.read_game(stream)) is not None:
            index = len(games)
            if game.errors or index >= 2 * count:
                raise ValueError(f"{identifier} has malformed or extra autonomous games")
            control, opening, owner = index >= count, (index % count) // 2, index % 2 == 0
            expected = f"DoppelMaia {identifier} " + ("base" if control else "personal")
            if game.headers["Event"] != expected:
                raise ValueError(f"{identifier} PGN game order differs from rollout metadata")
            board = game.board()
            moves = []
            prefix = len(openings[opening].split())
            for ply, move in enumerate(game.mainline_moves()):
                if ply >= prefix and board.turn == owner:
                    row = records[offset]
                    offset += 1
                    if row["fen"] != board.fen() or row["move"] != move.uci() or row["control"] != control:
                        raise ValueError(f"{identifier} recorded move does not match its complete PGN")
                    moves.append({"fen": row["fen"], "move": row["move"]})
                board.push(move)
            games.append({"index": index, "opening": opening, "control": control,
                          "color": "white" if owner else "black", "moves": moves})
        if len(games) != 2 * count or offset != len(records):
            raise ValueError(f"{identifier} rollout reconstruction omitted moves or games")
        result["profiles"].append({"id": identifier, "games": games})
    groups = output / f"{label}-groups.json"
    signatures = output / f"{label}-signatures.json"
    save_json(groups, result)
    subprocess.run(["node", str(Path(__file__).with_name("personality_curation_features.mjs")),
                    str(groups), str(signatures)], check=True)
    return json.loads(signatures.read_text())


def game_measurements(profile, signatures, trait_ids):
    weights = np.array([profile["weights"][trait] for trait in trait_ids])
    norm = np.abs(weights).sum()
    if norm <= 0:
        raise ValueError("A zero-effect profile cannot be curated")
    games = signatures["games"]
    count = len(games) // 2
    before = np.array([game["signature"] for game in games[count:]])
    after = np.array([game["signature"] for game in games[:count]])
    differences = (after - before) @ weights / norm
    samples = [{"gameId": f"opening-{game['opening']}"} for game in games[:count]]
    interval = paired_interval(samples, differences)
    opening_deltas = [float(differences[i:i + 2].mean()) for i in range(0, count, 2)]
    return {"personalGames": count, "baseControlGames": count, "pairedOpeningScoreChange95": interval,
            "positiveOpeningFraction": float(np.mean(np.array(opening_deltas) > 0)),
            "openingDeltas": opening_deltas,
            "chosenTraitChange": dict(zip(trait_ids, (after.mean(0) - before.mean(0)).tolist())),
            "passed": bool(interval["low"] > 0 and np.mean(np.array(opening_deltas) > 0) >= THRESHOLDS["positiveOpeningFraction"])}


def js(p, q, rows):
    middle = np.maximum((p + q) / 2, 1e-30)
    return float((p * (np.log(np.maximum(p, 1e-30)) - np.log(middle))
                  + q * (np.log(np.maximum(q, 1e-30)) - np.log(middle))).sum() / (2 * rows))


def discover(study, output):
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for common-rating policy evaluation")
    torch.set_num_threads(6)
    torch.backends.cuda.matmul.allow_tf32 = False
    practice = json.loads((study / "practice.json").read_text())
    evidence = json.loads((study / "personality-report.json").read_text())
    if digest(study / "practice.json") != evidence["practiceSHA256"]:
        raise ValueError("Practice data differs from the original training study")
    if digest(study / "maia3-personality-features.onnx") != evidence["preparedSHA256"]:
        raise ValueError("Cached feature model differs from the training study")
    signatures = rollout_signatures(study, output, "discovery")
    by_id = {row["id"]: row for row in signatures["profiles"]}
    original = {row["id"]: row for row in evidence["profiles"]}
    samples = practice["test"]["samples"]
    offset = len(practice["dataset"]["train"]["samples"]) + len(practice["dataset"]["validation"]["samples"])
    _, legal, _ = encode(samples)
    indices = np.array([MOVES[canonical_move(move, sample["fen"].split()[1] == "b")]
                        for sample in samples for move in sample["legalMoves"]])
    rows = np.concatenate([np.full(len(sample["legalMoves"]), i, np.int64) for i, sample in enumerate(samples)])
    traits = np.concatenate(practice["moveFeatures"]["test"])
    trait_ids = [trait["id"] for trait in practice["traits"]]
    with np.load(study / "practice-1500-features.npz") as cached:
        identity = hashlib.sha256((study / "practice.json").read_bytes() + b"1500"
                                  + evidence["preparedSHA256"].encode()).hexdigest()
        if str(cached["identity"]) != identity:
            raise ValueError("Common-rating cached features belong to another source")
        features = torch.tensor(cached["features"][offset:], device="cuda")
        base = torch.tensor(cached["base"][offset:], device="cuda")
    mask = torch.tensor(legal, device="cuda")
    baseline = base.masked_fill(~mask, -1e9).softmax(-1).cpu().numpy()
    base_flat = baseline[rows, indices]
    profiles, policies, choices, hashes = [], [], [], {}
    with torch.no_grad():
        for profile in practice["presets"]:
            identifier = profile["id"]
            adapter = study / f"{identifier}-adapter.npz"
            hashes[identifier] = digest(adapter)
            with np.load(adapter) as cached:
                matrix, bias = torch.tensor(cached["matrix"], device="cuda"), torch.tensor(cached["bias"], device="cuda")
            p = (base + features @ matrix + bias).masked_fill(~mask, -1e9).softmax(-1).cpu().numpy()
            flat, chosen = p[rows, indices], p.argmax(1)
            games = game_measurements(profile, by_id[identifier], trait_ids)
            departure = {"JS": js(flat, base_flat, len(samples)),
                         "topMoveDisagreement": float(np.mean(chosen != baseline.argmax(1)))}
            old = original[identifier]
            if old["configuration"] != profile:
                raise ValueError(f"{identifier} evidence uses different trait settings")
            reasons = []
            if not old["passed"] or old["scoreChange95"]["low"] <= 0 or old["KLChange95"]["high"] >= 0:
                reasons.append("Original held-out target direction was not established")
            if departure["JS"] < THRESHOLDS["baseJS"] or departure["topMoveDisagreement"] < THRESHOLDS["baseTopMoveDisagreement"]:
                reasons.append("Too close to the common-rating base policy")
            if not games["passed"]:
                reasons.append("Chosen moves were not consistent across the paired openings")
            profiles.append({"id": identifier, "name": profile["name"], "elo": profile["elo"],
                             "configuration": profile, "baseDeparture": departure, "games": games,
                             "expectedTraitChange": dict(zip(trait_ids, ((flat - base_flat) @ traits / len(samples)).tolist())),
                             "activeTraits": int(sum(value != 0 for value in profile["weights"].values())),
                             "eligible": not reasons, "reasons": reasons})
            policies.append(flat)
            choices.append(chosen)
    pairs = {}
    for i, a in enumerate(profiles):
        for j in range(i):
            b = profiles[j]
            disagreement = (choices[i] != choices[j]).astype(float)
            interval = paired_interval(samples, disagreement)
            distance = js(policies[i], policies[j], len(samples))
            pairs[tuple(sorted([a["id"], b["id"]]))] = {"JS": distance,
                "topMoveDisagreement": float(disagreement.mean()), "disagreement95": interval,
                "distinct": bool(distance >= THRESHOLDS["pairJS"]
                    and disagreement.mean() >= THRESHOLDS["pairTopMoveDisagreement"]
                    and interval["low"] >= THRESHOLDS["pairDisagreementLower95"])}
    selected = []
    for profile in sorted(profiles, key=lambda row: (row["activeTraits"], -row["baseDeparture"]["JS"], row["id"])):
        if not profile["eligible"]:
            continue
        neighbors = [other for other in selected if not pairs[tuple(sorted([profile["id"], other]))]["distinct"]]
        if neighbors:
            profile["reasons"].append("Similar measured policy to " + ", ".join(neighbors))
        else:
            selected.append(profile["id"])
    report = {"protocol": {"version": 1, "candidateCount": len(profiles), "commonElo": 1500,
                 "positions": len(samples), "sourceGames": len({row["gameId"] for row in samples}),
                 "thresholds": THRESHOLDS, "ordering": "Fewer active traits first, then larger base JS. Greedy distinctness, no target count.",
                 "games": "Reconstructed complete PGNs, paired colors clustered by opening. Shared JavaScript move features.",
                 "limitation": "Exploratory curation. Existing test boards now also select the catalog. Fresh autonomous openings provide a separate confirmation, not Elo or human imitation."},
              "source": {"practiceSHA256": digest(study / "practice.json"), "adaptersSHA256": hashes,
                         "rollouts": signatures["source"]},
              "profiles": profiles, "discoverySelected": selected, "selected": selected, "confirmed": False}
    save_json(output / "pairwise-policies.json", [{"profiles": list(pair), **value} for pair, value in pairs.items()])
    save_json(output / "curation-report.json", report)
    print(json.dumps({"eligible": sum(profile["eligible"] for profile in profiles), "selected": selected}, indent=2))


def confirm(study, output, fresh):
    raw = (fresh / "discovery-selection.json").read_bytes()
    report = json.loads(raw)
    rollout = json.loads((fresh / "personality-rollouts.json").read_text())
    protocol = rollout["protocol"]
    if report["confirmed"] or not protocol["freshOpenings"] or protocol["discoverySHA256"] != hashlib.sha256(raw).hexdigest():
        raise ValueError("Fresh games are not bound to an untouched discovery selection")
    if protocol["practiceSHA256"] != report["source"]["practiceSHA256"]:
        raise ValueError("Fresh games use different practice data")
    prior = json.loads((study / "personality-rollouts.json").read_text())["protocol"]["openings"]
    def opening_key(line):
        board = chess.Board()
        for move in line.split():
            board.push_san(move)
        return board.board_fen(), board.turn
    if {opening_key(line) for line in prior} & {opening_key(line) for line in protocol["openings"]}:
        raise ValueError("Confirmation reused an original opening position")
    (output / "discovery-report.json").write_bytes(raw)
    signatures = rollout_signatures(fresh, output, "confirmation")
    by_id = {row["id"]: row for row in signatures["profiles"]}
    if set(by_id) != set(report["discoverySelected"]):
        raise ValueError("Fresh games do not cover the complete discovered catalog")
    selected = []
    for row in report["profiles"]:
        if row["id"] not in by_id:
            continue
        measurements = game_measurements(row["configuration"], by_id[row["id"]], list(row["expectedTraitChange"]))
        row["confirmation"] = measurements
        if measurements["passed"]:
            selected.append(row["id"])
        else:
            row["reasons"].append("Did not confirm chosen-move direction on the fresh openings")
    report["selected"] = selected
    report["confirmed"] = True
    report["source"]["confirmationRollouts"] = signatures["source"]
    report["source"]["discoverySHA256"] = protocol["discoverySHA256"]
    report["source"]["confirmationReportSHA256"] = digest(fresh / "personality-rollouts.json")
    save_json(output / "curation-report.json", report)
    print(json.dumps({"confirmedCount": len(selected), "selected": selected}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--confirm", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.confirm:
        confirm(args.study, args.output, args.confirm)
    else:
        discover(args.study, args.output)


if __name__ == "__main__":
    main()
