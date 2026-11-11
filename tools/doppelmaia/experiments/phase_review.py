"""Describe game phases and data coverage without fitting on the examined test set."""

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def phase(sample):
    if sample["ply"] < 24:
        return "opening"
    pieces = sum(character in "PNBRQKpnbrqk" for character in sample["fen"].split()[0])
    return "sparse" if pieces <= 10 else "middle"


def repeated_choices(samples):
    boards = defaultdict(Counter)
    for sample in samples:
        key = " ".join(sample["fen"].split()[:4])
        boards[key][sample["move"]] += 1
    repeated = [counts for counts in boards.values() if counts.total() >= 2]
    return {
        "repeatedBoards": len(repeated),
        "boardsWithDifferentRecordedMoves": sum(len(counts) > 1 for counts in repeated),
        "observations": sum(counts.total() for counts in repeated),
        "scope": "Training only. Full board state without move counters. Not an accuracy ceiling.",
    }


def analyze(data, rows):
    players = {player["name"]: player for player in data["players"]}
    groups = defaultdict(lambda: {"positions": 0, "matches": 0, "crossEntropySum": 0.0, "games": set()})
    seen = set()
    methods = set()
    for row in rows:
        identity = (row["player"], row["method"], int(row["sample"]))
        if identity in seen:
            raise ValueError("Duplicate prediction identity")
        seen.add(identity)
        player = players[row["player"]]
        sample = player["splits"]["test"]["samples"][int(row["sample"])]
        if int(row["ply"]) != sample["ply"]:
            raise ValueError("Prediction and dataset ply do not match")
        category = phase(sample)
        subsets = ["all"]
        if row["strictNovel"] == "True":
            subsets.append("strictNovel")
        if row["familiar"] == "True":
            subsets.append("familiar")
        methods.add(row["method"])
        for subset in subsets:
            for label in [category, "overall"]:
                bucket = groups[(subset, label, row["method"])]
                bucket["positions"] += 1
                bucket["matches"] += int(row["match"])
                bucket["crossEntropySum"] += float(row["crossEntropy"])
                bucket["games"].add(row["gameId"])
    for name, player in players.items():
        expected = len(player["splits"]["test"]["samples"])
        for method in methods:
            if sum(account == name and candidate == method for account, candidate, _ in seen) != expected:
                raise ValueError("Incomplete per account prediction coverage")
    metrics = {}
    for (subset, category, method), counts in groups.items():
        metrics.setdefault(subset, {}).setdefault(category, {})[method] = {
            "positions": counts["positions"], "matches": counts["matches"],
            "moveAgreement": counts["matches"] / counts["positions"],
            "crossEntropy": counts["crossEntropySum"] / counts["positions"],
            "sourceGames": len(counts["games"]),
        }
    coverage = []
    for player in data["players"]:
        partitions = {}
        for split, part in player["splits"].items():
            samples = part["samples"]
            partitions[split] = {
                "positions": len(samples),
                "gamesRepresented": len({sample["gameId"] for sample in samples}),
                "phases": dict(Counter(phase(sample) for sample in samples)),
                "forcedPositions": sum(len(sample["legalMoves"]) == 1 for sample in samples),
            }
        coverage.append({"player": player["name"], "splits": partitions,
                         "trainingRepeatedChoices": repeated_choices(player["splits"]["train"]["samples"])})
    return {"metrics": metrics, "coverage": coverage}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("study", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report_path = args.study / "study-report.json"
    predictions_path = args.study / "predictions.csv"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if digest(args.dataset) != report["protocol"]["datasetSHA256"]:
        raise ValueError("Dataset differs from the locked study")
    if digest(predictions_path) != report["predictionsSHA256"]:
        raise ValueError("Predictions differ from the locked study")
    data = json.loads(args.dataset.read_text(encoding="utf-8"))
    with predictions_path.open(newline="") as stream:
        result = analyze(data, csv.DictReader(stream))
    for method, expected in report["aggregate"]["strictNovel"].items():
        measured = result["metrics"]["strictNovel"]["overall"][method]
        if measured["positions"] != expected["positions"] or abs(measured["moveAgreement"] - expected["moveMatch"]) > 1e-12:
            raise ValueError("Phase aggregation does not reproduce the locked headline")
    result["protocol"] = {
        "datasetSHA256": digest(args.dataset), "reportSHA256": digest(report_path),
        "predictionsSHA256": digest(predictions_path), "sourceSHA256": digest(Path(__file__)),
        "opening": "First 24 plies, meaning the first 12 full moves",
        "sparse": "After the opening with at most ten pieces including kings and pawns",
        "middle": "All remaining positions",
        "interpretation": "Descriptive post hoc slices. Not a new held out evaluation or proof of an emotional ceiling.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"selected": {subset: {label: row["selected"] for label, row in groups.items()}
                                  for subset, groups in result["metrics"].items()},
                      "coverage": result["coverage"]}, indent=2))


if __name__ == "__main__":
    main()
