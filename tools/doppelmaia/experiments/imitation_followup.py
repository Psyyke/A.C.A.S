"""Verify ownership specificity, repeat seeds, and exported opening predictions."""

import argparse
from collections import defaultdict
import csv
import hashlib
import json
from pathlib import Path
import subprocess

import chess
import numpy as np
import onnxruntime as ort
import torch

from imitation_study import apply_repertoire, build_repertoire, features_for, row_metrics, softmax
from native_data import position_key
from native_study import ROOT, BRIDGE, encode, feeds, fit, paired_interval, session, torch_pack


def load_adapter(path: Path) -> dict:
    with np.load(path) as saved:
        return {"matrix": saved["matrix"], "bias": saved["bias"], "width": int(saved["width"]),
                "repertoire": dict(zip(saved["keys"].tolist(), list(saved["deltas"]))),
                "strength": float(saved["strength"]), "elo": int(saved["elo"])}


def predict(features: dict, legal: np.ndarray, keys: list[str], model: dict) -> np.ndarray:
    values = features["base"] + features[str(model["width"])] @ model["matrix"] + model["bias"]
    return softmax(apply_repertoire(values, keys, model["repertoire"], model["strength"]), legal)


def opening_paths(samples: list[dict], probabilities: np.ndarray, targets: np.ndarray) -> dict:
    groups = defaultdict(list)
    for i, sample in enumerate(samples):
        groups[sample["gameId"]].append(i)
    prefixes = defaultdict(list)
    likelihoods = defaultdict(list)
    for rows in groups.values():
        rows.sort(key=lambda i: samples[i]["ply"])
        for count in [1, 2, 4, 6]:
            if len(rows) < count:
                continue
            indices = rows[:count]
            prefixes[count].append(bool(np.all(probabilities[indices].argmax(1) == targets[indices])))
            likelihoods[count].append(float(np.prod(probabilities[indices, targets[indices]].astype(np.float64))))
    return {str(count): {"games": len(prefixes[count]), "greedyExactOwnMovePrefix": float(np.mean(prefixes[count])),
                         "meanObservedOwnMovePrefixProbability": float(np.mean(likelihoods[count]))}
            for count in prefixes}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    parser.add_argument("--dataset", type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    torch.backends.cuda.matmul.allow_tf32 = False
    ort.preload_dlls()
    if not torch.cuda.is_available():
        raise RuntimeError("The followup requires CUDA")
    dataset = json.loads(args.dataset.read_text())
    main_report = json.loads((args.study / "imitation-report.json").read_text())
    old_hash = main_report["datasetSHA256"]
    source_players = {player["name"]: player for player in dataset["players"]}
    models = {name: load_adapter(args.study / f"{name}-selected-adapter.npz") for name in source_players}
    runtime = session(args.study / "maia3-full-features.onnx", True)
    report = {"datasetSHA256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
              "originalStudyDatasetSHA256": old_hash,
              "protocol": {"seeds": [43, 44], "fixedMethod": "Full 512 tanh features, SGD 0.005, maximum 40 epochs",
                           "ownerControl": "The same test positions and rating evaluated with each other player's adapter",
                           "openings": "Complete held out opening own turns, observed opponent replies. Prefix tests are teacher forced, not autonomous games."},
              "players": [], "exports": {}}
    csv_rows = []
    for original in main_report["players"]:
        name = original["name"]
        player, model = source_players[name], models[name]
        splits = player["splits"]
        samples = sum([splits[key]["samples"] for key in ["train", "validation", "test"]], [])
        tokens, legal, targets = encode(samples)
        keys = [position_key(chess.Board(sample["fen"])) for sample in samples]
        ntrain, nval = len(splits["train"]["samples"]), len(splits["validation"]["samples"])
        tr, va, te = slice(0, ntrain), slice(ntrain, ntrain + nval), slice(ntrain + nval, len(samples))
        with np.load(args.study / f"{name}-{model['elo']}-features.npz") as saved:
            identity = hashlib.sha256(json.dumps(samples).encode() + (args.study / "maia3-full-features.onnx").read_bytes()).hexdigest()
            if str(saved["identity"]) != identity:
                raise ValueError(f"Dataset positions changed since the study for {name}")
            features = {key: saved[key] for key in ["base", "64", "512"]}
        test_features = {key: value[te] for key, value in features.items()}
        owner_prob = predict(test_features, legal[te], keys[te], model)
        owner_metrics, owner_losses = row_metrics(owner_prob, targets[te])
        own_summary = original["selected"]["test"]["all"]
        if abs(owner_metrics["crossEntropy"] - own_summary["crossEntropy"]) > 1e-6:
            raise ValueError("Selected adapter does not reproduce the original test result")
        foreign_metrics, foreign_losses = [], []
        for other, foreign in models.items():
            if other == name:
                continue
            probs = predict(test_features, legal[te], keys[te], foreign)
            summary, losses = row_metrics(probs, targets[te])
            foreign_metrics.append({"owner": other, **summary})
            foreign_losses.append(losses)
        mean_foreign = np.mean(foreign_losses, axis=0)
        result = {"name": name, "own": owner_metrics, "foreign": foreign_metrics,
                  "ownLossVsMeanForeign95": paired_interval(samples[te], owner_losses - mean_foreign),
                  "seedReplicates": []}
        for seed in [43, 44]:
            train = torch_pack(features["512"][tr], features["base"][tr], legal[tr], targets[tr], "cuda")
            validation = torch_pack(features["512"][va], features["base"][va], legal[va], targets[va], "cuda")
            matrix, bias, training = fit(train, validation, 0, learning_rate=0.005, seed=seed)
            all_values = features["base"] + features["512"] @ matrix + bias
            repertoire = build_repertoire(samples[tr], keys[tr], softmax(all_values[tr], legal[tr]), targets[tr])
            score, strength = min((row_metrics(softmax(apply_repertoire(all_values[va], keys[va], repertoire, strength), legal[va]),
                                                   targets[va])[0]["crossEntropy"], strength) for strength in [0, 0.5, 1])
            p = softmax(apply_repertoire(all_values[te], keys[te], repertoire, strength), legal[te])
            summary, _ = row_metrics(p, targets[te])
            result["seedReplicates"].append({"seed": seed, "training": training,
                                             "openingStrength": strength, "validationLoss": score, "test": summary})
            del train, validation
        # A random legal label control has unchanged validation and the same early stopping.
        train = torch_pack(features["512"][tr], features["base"][tr], legal[tr], targets[tr], "cuda")
        validation = torch_pack(features["512"][va], features["base"][va], legal[va], targets[va], "cuda")
        matrix, bias, control = fit(train, validation, 0, learning_rate=0.005, random_labels=True)
        p = softmax(features["base"][te] + features["512"][te] @ matrix + bias, legal[te])
        result["randomLabels"] = {"training": control, "test": row_metrics(p, targets[te])[0],
                                  "note": "The neural control excludes the repertoire, which uses real observed opening counts"}
        del train, validation
        opening_samples = player["testOpeningSamples"]
        opening_tokens, opening_legal, opening_targets = encode(opening_samples)
        opening_keys = [position_key(chess.Board(sample["fen"])) for sample in opening_samples]
        opening_features = features_for(runtime, opening_tokens, model["elo"])
        base_prob = softmax(opening_features["base"], opening_legal)
        personal_prob = predict(opening_features, opening_legal, opening_keys, model)
        result["openingPaths"] = {"base": opening_paths(opening_samples, base_prob, opening_targets),
                                  "personal": opening_paths(opening_samples, personal_prob, opening_targets)}
        for i, sample in enumerate(opening_samples):
            csv_rows.append({"player": name, **{key: sample[key] for key in ["gameId", "ply", "fen", "move"]},
                             "baseProbability": float(base_prob[i, opening_targets[i]]),
                             "personalProbability": float(personal_prob[i, opening_targets[i]]),
                             "baseMatch": int(base_prob[i].argmax()) == int(opening_targets[i]),
                             "personalMatch": int(personal_prob[i].argmax()) == int(opening_targets[i])})
        prepared = args.study / f"{name}-export-features.onnx"
        subprocess.run(["node", str(BRIDGE), "prepare", str(ROOT / "app/assets/engines/Maia3/model/maia3_simplified.onnx"),
                        str(prepared), str(model["width"])], check=True)
        binary = args.study / f"{name}-adapter.bin"
        np.concatenate([model["matrix"].ravel(), model["bias"]]).astype("<f4").tofile(binary)
        repertoire_file = args.study / f"{name}-repertoire.json"
        repertoire_file.write_text(json.dumps({"strength": model["strength"],
                                               "entries": [{"key": key, "delta": delta.tolist()} for key, delta in model["repertoire"].items()]}))
        exported = args.study / f"{name}-personal.onnx"
        subprocess.run(["node", str(BRIDGE), "export", str(prepared), str(exported), str(binary), str(repertoire_file)], check=True)
        exported_runtime = session(exported, True)
        error = 0
        # Include matching repertoire boards and genuinely novel boards in the export check.
        probe_samples = samples[te][:4] + opening_samples[:4]
        probe_tokens, _, _ = encode(probe_samples)
        probe_keys = [position_key(chess.Board(sample["fen"])) for sample in probe_samples]
        for rating in [max(600, model["elo"] - 400), model["elo"], min(2600, model["elo"] + 400)]:
            probe_features = features_for(runtime, probe_tokens, rating)
            expected = probe_features["base"] + probe_features[str(model["width"])] @ model["matrix"] + model["bias"]
            expected = apply_repertoire(expected, probe_keys, model["repertoire"], model["strength"])
            actual = exported_runtime.run(["logits_move"], feeds(probe_tokens, rating))[0]
            error = max(error, float(np.max(np.abs(actual - expected))))
        if error > 0.002:
            raise ValueError(f"Native portable export failed for {name} with error {error}")
        report["exports"][name] = {"maximumLogitError": error, "bytes": exported.stat().st_size,
                                   "trainingElo": model["elo"], "featureSize": model["width"],
                                   "SHA256": hashlib.sha256(exported.read_bytes()).hexdigest()}
        del exported_runtime
        binary.unlink()
        prepared.unlink()
        report["players"].append(result)
        (args.study / "imitation-followup.json").write_text(json.dumps(report, indent=2))
        print(name, "ownerCE", round(owner_metrics["crossEntropy"], 3),
              "foreignCE", round(float(mean_foreign.mean()), 3), "exportError", error, flush=True)
    with (args.study / "opening-predictions.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(csv_rows[0]))
        writer.writeheader()
        writer.writerows(csv_rows)


if __name__ == "__main__":
    main()
