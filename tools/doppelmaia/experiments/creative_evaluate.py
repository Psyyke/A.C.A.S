"""Freeze validation choices before comparing known and genuinely later game windows."""

import argparse
import csv
import gc
import json
from pathlib import Path
import zipfile

import chess
import numpy as np

from native_data import position_key
from phase_review import digest, phase
from unseen_data import save_json


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def board_keys(samples):
    return {position_key(chess.Board(sample["fen"])) for sample in samples}


def slices(sample, familiar, novel):
    category = phase(sample)
    result = ["all"]
    if category == "opening" and familiar:
        result.append("familiar-opening")
    if novel:
        result.extend(["strict-new", "new-" + category])
    return result


def freeze(args):
    original = load(args.previous)
    development = load(args.development / "protocol.json")
    dataset_hash = digest(args.dataset)
    if original["datasetSHA256"] != dataset_hash or development["datasetSHA256"] != dataset_hash:
        raise ValueError("The selected models must use the same original training dataset")
    dataset = load(args.dataset)
    if set(development["players"]) != {player["name"] for player in dataset["players"]}:
        raise ValueError("The followup must cover every predefined account")
    if development["positionLimit"] < max(len(player["splits"]["train"]["samples"]) for player in dataset["players"]):
        raise ValueError("The final followup must use the complete training pool, not the small screen")
    decisions = []
    for original_player in original["players"]:
        name = original_player["name"]
        old = original_player["context"]
        if digest(Path(old["path"])) != old["sha256"]:
            raise ValueError("A preserved previous model changed")
        candidates = [{"id": "previous", "path": old["path"], "sha256": old["sha256"], "validationCE": old["validationCE"]}]
        for method in development["methods"]:
            report_path = args.development / name / f"{method}.json"
            report = load(report_path)
            path = report_path.with_suffix(".onnx")
            if report["protocolSHA256"] != digest(args.development / "protocol.json") or digest(path) != report["exportSHA256"]:
                raise ValueError("A new model does not match the frozen development protocol")
            candidates.append({"id": method, "path": str(path.resolve()), "sha256": report["exportSHA256"],
                               "validationCE": report["validation"]["loss"], "reportSHA256": digest(report_path)})
        average_path = args.development / name / "averages.json"
        if average_path.exists():
            averages = load(average_path)
            if averages["protocolSHA256"] != digest(args.development / "protocol.json"):
                raise ValueError("Checkpoint averaging belongs to a different study")
            for candidate in averages["results"]:
                if "exportSHA256" not in candidate:
                    continue
                path = args.development / name / f'{candidate["id"]}.onnx'
                if digest(path) != candidate["exportSHA256"]:
                    raise ValueError("An averaged model changed")
                candidates.append({"id": candidate["id"], "path": str(path.resolve()), "sha256": candidate["exportSHA256"],
                                   "validationCE": candidate["loss"], "reportSHA256": digest(average_path)})
        chosen = candidates[0]
        for candidate in sorted(candidates[1:], key=lambda row: row["id"]):
            if candidate["validationCE"] < chosen["validationCE"] - 1e-5:
                chosen = candidate
        decisions.append({"name": name, "elo": original_player["elo"], "previous": candidates[0],
                          "selected": chosen, "candidates": candidates})
    fresh = load(args.fresh)
    if fresh["protocol"]["previousDatasetSHA256"] != dataset_hash:
        raise ValueError("The fresh window does not follow this study")
    if set(fresh["protocol"]["accounts"]) != {decision["name"] for decision in decisions}:
        raise ValueError("The fresh cohort changed after development")
    files = ["creative_evaluate.py", "context_models.py", "context_probe.py", "finetune_model.py",
             "phase_review.py", "native_data.py", "native_study.py", "unseen_data.py"]
    protocol = {"datasetSHA256": dataset_hash, "freshSHA256": digest(args.fresh),
                "previousSelectionSHA256": digest(args.previous),
                "previousBoardDataset": original["previousDatasetPath"],
                "previousBoardDatasetSHA256": original["previousDatasetSHA256"],
                "developmentProtocolSHA256": digest(args.development / "protocol.json"),
                "selection": "Minimum fixed novel validation CE with improvement larger than 0.00001. Previous model remains eligible.",
                "knownWindow": "Previously examined test data. A paired descriptive recheck, not fresh confirmation.",
                "freshWindow": "Previously unused later games. New boards also exclude every previously examined sample from this account.",
                "scope": "Per-account novelty, not novelty against other accounts or Maia pretraining. One training seed.",
                "players": decisions, "source": {name: digest(Path(__file__).with_name(name)) for name in files}}
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / "frozen-selections.json"
    if path.exists() and load(path) != protocol:
        raise ValueError("Use a new evaluation directory for changed selections")
    save_json(path, protocol)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(path, "frozen-selections.json")
    print(json.dumps({row["name"]: row["selected"]["id"] for row in decisions}, indent=2), flush=True)


def summarize(records):
    from native_study import paired_interval
    result = {}
    for label in ["all", "familiar-opening", "new-opening", "new-middle", "new-sparse", "strict-new"]:
        rows = [row for row in records if label in row["slices"]]
        if not rows:
            result[label] = {"positions": 0}
            continue
        previous = np.array([row["previousMatch"] for row in rows], dtype=float)
        selected = np.array([row["selectedMatch"] for row in rows], dtype=float)
        result[label] = {"positions": len(rows), "games": len({row["gameId"] for row in rows}),
                         "previousMatches": int(previous.sum()), "selectedMatches": int(selected.sum()),
                         "previousAgreement": float(previous.mean()), "selectedAgreement": float(selected.mean()),
                         "previousCE": float(np.mean([row["previousLoss"] for row in rows])),
                         "selectedCE": float(np.mean([row["selectedLoss"] for row in rows])),
                         "pairedGain": paired_interval(rows, selected - previous)}
    return result


def evaluate(args):
    import torch
    from context_models import ShippedContext, history_tokens
    from context_probe import measure

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the frozen evaluation")
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    path = args.output / "frozen-selections.json"
    protocol = load(path)
    if digest(args.dataset) != protocol["datasetSHA256"] or digest(args.fresh) != protocol["freshSHA256"]:
        raise ValueError("Evaluation data changed after selection")
    for name, expected in protocol["source"].items():
        if digest(Path(__file__).with_name(name)) != expected:
            raise ValueError("Evaluation code changed after selection")
    previous_path = Path(protocol["previousBoardDataset"])
    if digest(previous_path) != protocol["previousBoardDatasetSHA256"]:
        raise ValueError("Earlier board exposure data changed")
    previous = load(previous_path)
    exposed = {player["name"]: board_keys([sample for part in player["splits"].values() for sample in part["samples"]])
               for player in previous["players"]}
    del previous
    data = load(args.dataset)
    fresh = load(args.fresh)
    players = {player["name"]: player for player in data["players"]}
    later = {player["name"]: player for player in fresh["players"]}
    records = {"known": [], "fresh": []}
    for decision in protocol["players"]:
        name = decision["name"]
        player = players[name]
        seen = board_keys(player["splits"]["train"]["samples"])
        known = seen | exposed[name] | board_keys(player["splits"]["validation"]["samples"])
        all_exposed = known | board_keys(player["splits"]["test"]["samples"])
        for window, samples, games, absent in [
                ("known", player["splits"]["test"]["samples"], player["games"], known),
                ("fresh", later[name]["samples"], later[name]["games"], all_exposed)]:
            if not samples:
                print(json.dumps({"window": window, "player": name, "positions": 0}), flush=True)
                continue
            sources = {game["id"]: game["source"] for game in games}
            tokens, legal, targets = history_tokens(samples)
            predictions = {}
            for method in ["previous", "selected"]:
                candidate = decision[method]
                if digest(Path(candidate["path"])) != candidate["sha256"]:
                    raise ValueError("A frozen evaluation model changed")
                if method == "selected" and candidate["sha256"] == decision["previous"]["sha256"]:
                    predictions[method] = predictions["previous"]
                    continue
                model = ShippedContext(Path(candidate["path"])).cuda().eval()
                predictions[method] = measure(model, tokens, legal, targets, decision["elo"], 64)
                del model
                gc.collect()
                torch.cuda.empty_cache()
            for index, sample in enumerate(samples):
                key = position_key(chess.Board(sample["fen"]))
                row = {"player": name, "sample": index, "gameId": sources[sample["gameId"]],
                       "ply": sample["ply"], "slices": slices(sample, key in seen, key not in absent)}
                for method, result in predictions.items():
                    row[method + "Match"] = int(result["matches"][index])
                    row[method + "Loss"] = result["losses"][index]
                    row[method + "Prediction"] = result["predicted"][index]
                records[window].append(row)
            print(json.dumps({"window": window, "player": name, "positions": len(samples),
                              "previous": predictions["previous"]["accuracy"], "selected": predictions["selected"]["accuracy"]}), flush=True)
            del tokens, legal, targets, predictions
            gc.collect()
    for window, rows in records.items():
        if not rows:
            raise ValueError(f"No eligible {window} positions were available. Do not claim a completed comparison.")
        metrics = summarize(rows)
        if window == "known" and (metrics["strict-new"]["positions"] != 21687 or metrics["strict-new"]["previousMatches"] != 13348):
            raise ValueError("The known-window baseline failed to reproduce the locked result")
        output = args.output / f"{window}-predictions.csv"
        with output.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows({**row, "slices": "|".join(row["slices"])} for row in rows)
        save_json(args.output / f"{window}-summary.json", {"protocolSHA256": digest(path), "predictionsSHA256": digest(output),
                  "scope": protocol["knownWindow" if window == "known" else "freshWindow"], "metrics": metrics,
                  "players": {name: summarize([row for row in rows if row["player"] == name]) for name in players}})
        print(json.dumps({"window": window, "metrics": metrics}, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["freeze", "evaluate"])
    parser.add_argument("dataset", type=Path)
    parser.add_argument("previous", type=Path)
    parser.add_argument("development", type=Path)
    parser.add_argument("fresh", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    freeze(args) if args.command == "freeze" else evaluate(args)


if __name__ == "__main__":
    main()
