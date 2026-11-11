"""Preregistered non-BOT, fresh-game comparison of browser-compatible Maia 3 training."""

import argparse
import csv
import gc
import hashlib
import json
from pathlib import Path

import chess
import numpy as np
import torch

from finetune_model import Maia3
from finetune_study import MODEL, ambiguity, predict, save_json, summarize
from generalization_data import header
from imitation_study import row_metrics, softmax
from native_data import position_key
from native_study import encode, fit, paired_interval, torch_pack
from transformer_workflow import fit_full


CONFIGS = [
    {"id": "full-6000", "cap": 6000, "learningRate": 1e-5, "baseAnchor": 0.25},
    {"id": "full-all", "cap": 24000, "learningRate": 1e-5, "baseAnchor": 0.25},
    {"id": "full-personal", "cap": 24000, "learningRate": 1e-5, "baseAnchor": 0},
    {"id": "full-faster", "cap": 24000, "learningRate": 3e-5, "baseAnchor": 0.25},
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pick(rows, cap):
    return [rows[i] for i in np.linspace(0, len(rows) - 1, min(cap, len(rows)), dtype=int)]


def keys(rows):
    return [position_key(chess.Board(row["fen"])) for row in rows]


def audit_dataset(data, directory):
    if data.get("version") != 2:
        raise ValueError("Use the audited version 2 non-BOT dataset")
    index = json.loads((directory / "source-index.json").read_text())
    audit = []
    for player in data["players"]:
        name = player["name"]
        source = directory / "source-games" / f"{name}.pgn"
        if digest(source) != index["files"][name]["sha256"]:
            raise ValueError(f"{name} source PGN hash mismatch")
        raw = source.read_bytes()
        offset = 0
        account = index["names"][name]
        for _, length in index["files"][name]["rows"]:
            block = raw[offset:offset + length]
            offset += length
            side = "White" if header(block, "White") == account else "Black"
            if header(block, side) != account or header(block, side + "Title") == "BOT":
                raise ValueError(f"{name} failed the source account audit")
        if offset != len(raw):
            raise ValueError(f"{name} source byte lengths differ")
        intervals, owned = {}, set()
        for split in ["train", "validation", "test"]:
            games = [row for row in player["games"] if row["split"] == split]
            stamps = [(row["date"], row["time"]) for row in games]
            if not stamps or any(not date or not time for date, time in stamps):
                raise ValueError(f"{name} lacks timestamp evidence")
            intervals[split] = [list(min(stamps)), list(max(stamps))]
            ids = {row["id"] for row in games}
            sources = {row["source"] for row in games}
            if owned & sources or len(sources) != len(games):
                raise ValueError(f"{name} has duplicated source games")
            owned.update(sources)
            if any(row["gameId"] not in ids for row in player["splits"][split]["samples"]):
                raise ValueError(f"{name} has positions in the wrong split")
        if not intervals["train"][1] <= intervals["validation"][0] <= intervals["validation"][1] <= intervals["test"][0]:
            raise ValueError(f"{name} source archive order is not chronological")
        training_ratings = [row["playerRating"] for row in player["games"]
                            if row["split"] == "train" and row["playerRating"] is not None]
        if float(np.median(training_ratings)) != player["medianRating"]:
            raise ValueError(f"{name} conditioning was not computed from training only")
        audit.append({"name": name, "sourceSHA256": digest(source), "botTitleGames": 0,
                      "sourceGames": player["sourceGames"], "utcIntervals": intervals})
    return audit


def options(config):
    return {"method": "full", "epochs": 12, "learningRate": config["learningRate"],
            "baseAnchor": config["baseAnchor"], "batchSize": 32, "patience": 2,
            "weightDecay": 0.01, "clipNorm": 1, "seed": 42}


def train_player(player, directory):
    directory.mkdir(exist_ok=True)
    training = player["splits"]["train"]["samples"]
    seen = set(keys(training))
    validation = [row for row in player["splits"]["validation"]["samples"]
                  if position_key(chess.Board(row["fen"])) not in seen]
    if len(validation) < 100:
        raise ValueError(f"{player['name']} has fewer than 100 common novel validation boards")
    elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
    candidates = []
    for config in CONFIGS:
        report_path = directory / (config["id"] + ".json")
        model_path = directory / (config["id"] + ".onnx")
        if report_path.exists():
            candidate = json.loads(report_path.read_text())
            if digest(model_path) != candidate["exportSHA256"]:
                raise ValueError(f"{model_path} was modified after training")
        else:
            model = Maia3(MODEL).cuda()
            candidate = fit_full(model, pick(training, config["cap"]), validation, elo, options(config),
                lambda point: print(json.dumps({"player": player["name"], "candidate": config["id"], **point}), flush=True),
                cuda_graphs=True)
            pending = model_path.with_suffix(".pending.onnx")
            model.export(pending)
            pending.replace(model_path)
            candidate.update({"id": config["id"], "export": model_path.name, "exportSHA256": digest(model_path)})
            save_json(report_path, candidate)
            del model
            gc.collect()
            torch.cuda.empty_cache()
        candidates.append(candidate)
    frozen_path = directory / "frozen-tanh.json"
    if frozen_path.exists():
        frozen = json.loads(frozen_path.read_text())
        if digest(directory / "frozen-tanh.npz") != frozen["weightsSHA256"]:
            raise ValueError("Frozen comparison weights changed")
    else:
        rows = pick(training, 6000) + validation
        ntrain = min(6000, len(training))
        tokens, legal, targets = encode(rows)
        model = Maia3(MODEL).cuda()
        base, _, pooled = predict(model, tokens, elo)
        features = np.tanh(pooled)
        train = torch_pack(features[:ntrain], base[:ntrain], legal[:ntrain], targets[:ntrain], "cuda")
        valid = torch_pack(features[ntrain:], base[ntrain:], legal[ntrain:], targets[ntrain:], "cuda")
        matrix, bias, frozen = fit(train, valid, 0, epochs=40, learning_rate=0.005)
        np.savez_compressed(directory / "frozen-tanh.npz", matrix=matrix, bias=bias)
        frozen.update({"features": "tanh of the actual 512 pooled source features", "trainingPositions": ntrain,
                       "validationPositions": len(validation), "openingMemory": False,
                       "selection": "Common novel validation CE, including epoch zero",
                       "weightsSHA256": digest(directory / "frozen-tanh.npz")})
        save_json(frozen_path, frozen)
        del train, valid, model
        gc.collect()
        torch.cuda.empty_cache()
    selected = min(candidates, key=lambda row: row["exportedObjectiveLoss"])
    decision = {"name": player["name"], "elo": elo, "selected": selected["id"],
                "commonNovelValidationPositions": len(validation), "candidates": candidates, "frozen": frozen}
    save_json(directory / "selection.json", decision)
    return decision


def random_control(player, directory):
    path = directory / "random-labels.json"
    if path.exists():
        result = json.loads(path.read_text())
        if digest(directory / "random-labels.onnx") != result["exportSHA256"]:
            raise ValueError("Random-label control model changed")
        return result
    training = pick(player["splits"]["train"]["samples"], 6000)
    seen = set(keys(player["splits"]["train"]["samples"]))
    validation = [row for row in player["splits"]["validation"]["samples"]
                  if position_key(chess.Board(row["fen"])) not in seen]
    rng = np.random.default_rng(77123)
    shuffled = [{**row, "move": row["legalMoves"][rng.integers(len(row["legalMoves"]))]} for row in training]
    elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
    model = Maia3(MODEL).cuda()
    result = fit_full(model, shuffled, validation, elo, options(CONFIGS[0]), cuda_graphs=True)
    model.export(directory / "random-labels.onnx")
    result["exportSHA256"] = digest(directory / "random-labels.onnx")
    result["validationLabels"] = "Unmodified recorded moves, not the random training labels"
    save_json(path, result)
    del model
    gc.collect()
    torch.cuda.empty_cache()
    return result


def evaluate_player(player, selection, directory, wrong_path, first):
    training = player["splits"]["train"]["samples"]
    validation = player["splits"]["validation"]["samples"]
    samples = player["splits"]["test"]["samples"]
    tokens, legal, targets = encode(samples)
    seen, seen_all = set(keys(training)), set(keys(training + validation))
    test_keys = keys(samples)
    masks = {"all": np.ones(len(samples), bool),
             "novel": np.array([key not in seen for key in test_keys]),
             "strictNovel": np.array([key not in seen_all for key in test_keys]),
             "familiar": np.array([key in seen for key in test_keys]),
             "opening": np.array([row["ply"] < 24 for row in samples]),
             "later": np.array([row["ply"] >= 24 for row in samples])}
    sources = {game["id"]: game["source"] for game in player["games"]}
    clustered = [{**row, "gameId": sources[row["gameId"]]} for row in samples]
    elo = selection["elo"]
    model = Maia3(MODEL).cuda()
    base, base_value, pooled = predict(model, tokens, elo)
    raised_base, _, _ = predict(model, tokens, min(2600, elo + 200))
    del model
    methods = {}
    rows = []

    def record(name, logits, values=None):
        result = summarize(logits, base, legal, targets, clustered, masks)
        if values is not None:
            result["valueDrift"] = {"maximum": float(np.abs(values - base_value).max()),
                                    "meanAbsolute": float(np.abs(values - base_value).mean())}
        probabilities = softmax(logits, legal)
        for i, sample in enumerate(samples):
            rows.append({"player": player["name"], "method": name, "gameId": sources[sample["gameId"]],
                         "sample": i, "ply": sample["ply"], "strictNovel": bool(masks["strictNovel"][i]),
                         "novel": bool(masks["novel"][i]), "familiar": bool(masks["familiar"][i]),
                         "match": int(probabilities[i].argmax() == targets[i]),
                         "probability": float(probabilities[i, targets[i]]),
                         "crossEntropy": float(-np.log(max(probabilities[i, targets[i]], 1e-30)))})
        methods[name] = result

    record("base", base)
    record("base-plus200", raised_base)
    with np.load(directory / "frozen-tanh.npz") as adapter:
        logits = torch.tensor(np.tanh(pooled), device="cuda") @ torch.tensor(adapter["matrix"], device="cuda")
        logits += torch.tensor(adapter["bias"], device="cuda")
        record("frozen-tanh", base + logits.cpu().numpy())
        del logits
    for candidate in selection["candidates"]:
        path = directory / candidate["export"]
        if digest(path) != candidate["exportSHA256"]:
            raise ValueError("Candidate model changed before test evaluation")
        model = Maia3(path).cuda()
        logits, values, _ = predict(model, tokens, elo)
        record(candidate["id"], logits, values)
        if candidate["id"] == selection["selected"]:
            record("selected", logits, values)
            higher, _, _ = predict(model, tokens, min(2600, elo + 200))
            record("selected-plus200", higher)
        del model
        gc.collect()
        torch.cuda.empty_cache()
    for name, path in [("wrong-player", wrong_path)] + ([("random-labels", directory / "random-labels.onnx")] if first else []):
        model = Maia3(path).cuda()
        record(name, predict(model, tokens, elo)[0])
        del model
        gc.collect()
        torch.cuda.empty_cache()
    with (directory / "predictions.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    result = {"name": player["name"], "elo": elo, "sourceGames": player["sourceGames"],
              "counts": {key: len(player["splits"][key]["samples"]) for key in ["train", "validation", "test"]},
              "selected": selection["selected"], "selection": selection, "methods": methods,
              "trainingAmbiguity": ambiguity(keys(training), encode(training)[2])}
    save_json(directory / "test-report.json", result)
    return result, rows


def aggregate(players, rows):
    summary = {}
    for group in ["all", "novel", "strictNovel", "familiar", "opening", "later"]:
        summary[group] = {}
        for method in players[0]["methods"]:
            metrics = [player["methods"][method][group] for player in players
                       if method in player["methods"] and group in player["methods"][method]]
            count = sum(row["positions"] for row in metrics)
            if count:
                summary[group][method] = {"positions": count, "accounts": len(metrics),
                    "moveMatch": sum(row["positions"] * row["moveMatch"] for row in metrics) / count,
                    "crossEntropy": sum(row["positions"] * row["crossEntropy"] for row in metrics) / count,
                    "equalAccountMoveMatch": float(np.mean([row["moveMatch"] for row in metrics]))}
    base = {(row["player"], row["sample"]): row for row in rows if row["method"] == "base"}
    for method in summary["strictNovel"]:
        selected = [row for row in rows if row["method"] == method and row["strictNovel"]]
        delta = np.array([row["match"] - base[(row["player"], row["sample"])]["match"] for row in selected])
        ce_delta = np.array([row["crossEntropy"] - base[(row["player"], row["sample"])]["crossEntropy"] for row in selected])
        summary["strictNovel"][method]["top1Change95"] = paired_interval(selected, delta)
        summary["strictNovel"][method]["CEChange95"] = paired_interval(selected, ce_delta)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--stage", choices=["train", "evaluate"], default="train")
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for this study")
    torch.set_num_threads(6)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.manual_seed(42)
    data = json.loads(args.dataset.read_text())
    audit = audit_dataset(data, args.dataset.parent)
    args.output.mkdir(parents=True, exist_ok=True)
    files = ["generalization_study.py", "generalization_data.py", "transformer_workflow.py",
             "finetune_model.py", "finetune_study.py", "native_study.py", "native_data.py", "imitation_study.py"]
    protocol = {"version": 1, "datasetSHA256": digest(args.dataset), "modelSHA256": digest(MODEL),
        "sourceSHA256": {name: digest(Path(__file__).with_name(name)) for name in files},
        "torch": torch.__version__, "numpy": np.__version__, "device": torch.cuda.get_device_name(),
        "configs": CONFIGS, "options": [options(config) for config in CONFIGS],
        "selection": "Common training-unseen validation boards for every candidate. Minimum CE including epoch zero. All choices persisted before test evaluation.",
        "test": "Later source games, never used for training or selection. Strict novelty excludes every training and validation board input.",
        "accountAudit": audit, "excluded": data["excluded"],
        "controls": "Correct tanh512 frozen ablation without opening lookup, first eligible account random-label control, cyclic other-account model.",
        "intervals": "Paired complete source games, including shared games across accounts. Conditional on this activity-selected cohort, not a population interval.",
        "conditioning": "Training-only median rounded to 100. Same rating for self and opponent, as in the browser. Higher conditioning is not measured playing strength.",
        "execution": "FP32 CUDA graphs, algebraically the same AdamW as the browser. TF32 disabled."}
    protocol_path = args.output / "protocol.json"
    if protocol_path.exists() and json.loads(protocol_path.read_text()) != protocol:
        raise ValueError("Output belongs to a different source, implementation or fixed protocol")
    if not protocol_path.exists():
        save_json(protocol_path, protocol)
    selections = []
    for player in data["players"]:
        directory = args.output / player["name"]
        if args.stage == "train":
            selections.append(train_player(player, directory))
        else:
            selections.append(json.loads((directory / "selection.json").read_text()))
    if args.stage == "train":
        control = random_control(data["players"][0], args.output / data["players"][0]["name"])
        save_json(args.output / "validation-selections.json", {"players": selections, "randomControl": control})
        print("All validation decisions saved. The sealed test predictions have not been evaluated.", flush=True)
        return
    saved = json.loads((args.output / "validation-selections.json").read_text())
    if saved["players"] != selections:
        raise ValueError("Validation decisions changed after training")
    players, predictions = [], []
    for index, (player, selection) in enumerate(zip(data["players"], selections)):
        other = selections[(index + 1) % len(selections)]
        wrong_path = args.output / other["name"] / (other["selected"] + ".onnx")
        result, rows = evaluate_player(player, selection, args.output / player["name"], wrong_path, index == 0)
        players.append(result)
        predictions.extend(rows)
        print(json.dumps({"name": player["name"], "strictNovel": result["methods"]["selected"].get("strictNovel")}), flush=True)
    report = {"protocol": protocol, "players": players, "summary": aggregate(players, predictions)}
    save_json(args.output / "generalization-report.json", report)
    print(json.dumps(report["summary"]["strictNovel"], indent=2), flush=True)


if __name__ == "__main__":
    main()
