"""Compare matched rating imitation, richer features and personal openings."""

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import subprocess

import chess
import numpy as np
import onnx
from onnx import helper, TensorProto
import onnxruntime as ort
import torch

from native_data import position_key
from native_study import ROOT, BRIDGE, WIDTH, encode, feeds, fit, paired_interval, session, torch_pack


VARIANTS = [
    ("projected64-sgd", 64, "sgd", 0.02),
    ("full512-sgd", 512, "sgd", 0.005),
    ("projected64-adam", 64, "adam", 0.001),
    ("full512-adam", 512, "adam", 0.001),
]


def softmax(values: np.ndarray, legal: np.ndarray) -> np.ndarray:
    shifted = np.where(legal, values, -1e9)
    shifted -= shifted.max(axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=1, keepdims=True)


def row_metrics(probabilities: np.ndarray, targets: np.ndarray) -> tuple[dict, np.ndarray]:
    losses = -np.log(np.maximum(probabilities[np.arange(len(targets)), targets], 1e-30))
    return {"positions": len(targets), "crossEntropy": float(losses.mean()),
            "moveMatch": float((probabilities.argmax(1) == targets).mean())}, losses


def build_repertoire(samples: list[dict], keys: list[str], probabilities: np.ndarray,
                     targets: np.ndarray, anchor: float = 0) -> dict[str, np.ndarray]:
    groups = defaultdict(list)
    for i, sample in enumerate(samples):
        if sample["ply"] < 24:
            groups[keys[i]].append(i)
    def signature_key(key):
        board = chess.Board(key + " w - - 0 1")
        signature = [0] * 16
        for square, piece in board.piece_map().items():
            index = piece.piece_type + (0 if piece.color else 6)
            signature[square // 4] += index * 13 ** (square % 4)
        return ",".join(map(str, signature))
    groups = sorted(((key, rows) for key, rows in groups.items() if len(rows) >= 2),
                    key=lambda item: (-len(item[1]), signature_key(item[0])))[:128]
    repertoire = {}
    for key, rows in groups:
        p = probabilities[rows[0]].astype(np.float64)
        counts = np.bincount(targets[rows], minlength=WIDTH)
        posterior = (counts + 4 * p) / (len(rows) + 4)
        delta = np.zeros(WIDTH, np.float32)
        legal = p > 0
        delta[legal] = np.clip(np.log(np.maximum(posterior[legal], 1e-30)) - np.log(np.maximum(p[legal], 1e-30)), -4, 4)
        repertoire[key] = delta * (1 - anchor)
    return repertoire


def apply_repertoire(values: np.ndarray, keys: list[str], repertoire: dict, strength: float) -> np.ndarray:
    result = values.copy()
    for i, key in enumerate(keys):
        if key in repertoire:
            result[i] += strength * repertoire[key]
    return result


def prepare_full(path: Path) -> None:
    if path.exists():
        return
    prepared = path.with_name("maia3-projected-features.onnx")
    subprocess.run(["node", str(BRIDGE), "prepare",
                    str(ROOT / "app/assets/engines/Maia3/model/maia3_simplified.onnx"), str(prepared)], check=True)
    model = onnx.load(prepared)
    model.graph.node.append(helper.make_node("Tanh", ["/model/last_ln/LayerNormalization_output_0"], ["acas_full_features"]))
    model.graph.output.append(helper.make_tensor_value_info("acas_full_features", TensorProto.FLOAT, ["batch_size", 512]))
    onnx.checker.check_model(model)
    onnx.save(model, path)


def features_for(runtime: ort.InferenceSession, tokens: np.ndarray, elo: int) -> dict:
    values = {"base": [], "64": [], "512": []}
    for start in range(0, len(tokens), 128):
        output = runtime.run(["acas_base_logits", "acas_features", "acas_full_features"], feeds(tokens[start:start + 128], elo))
        for key, value in zip(values, output):
            if not np.isfinite(value).all():
                raise ValueError("Nonfinite imitation features")
            values[key].append(value)
    return {key: np.concatenate(rows) for key, rows in values.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", type=int, default=10)
    parser.add_argument("--epochs", type=int, default=40)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    torch.backends.cuda.matmul.allow_tf32 = False
    if not torch.cuda.is_available():
        raise RuntimeError("The imitation study requires native CUDA")
    ort.preload_dlls()
    prepared = args.output / "maia3-full-features.onnx"
    prepare_full(prepared)
    runtime = session(prepared, True)
    dataset = json.loads(args.dataset.read_text())
    report = {"source": {key: value for key, value in dataset.items() if key != "players"},
              "datasetSHA256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
              "protocol": {"variants": VARIANTS, "epochs": args.epochs, "trainingSeed": 42,
                           "anchor": 0, "selection": "Validation actual move cross entropy only",
                           "opening": "Training only counts before ply 24, at least two observations, prior 4, delta clipped to 4, at most 128 positions",
                           "openingStrengths": [0, 0.5, 1], "eloOffsets": [-400, 0, 400],
                           "note": "Familiar input positions can repeat between separate games. Novel inputs are reported separately."},
              "players": []}
    prediction_rows = []
    for player in dataset["players"][:args.players]:
        name, splits = player["name"], player["splits"]
        counts = {key: len(splits[key]["samples"]) for key in ["train", "validation", "test"]}
        samples = sum([splits[key]["samples"] for key in ["train", "validation", "test"]], [])
        tokens, legal, targets = encode(samples)
        keys = [position_key(chess.Board(sample["fen"])) for sample in samples]
        ntrain, nval = counts["train"], counts["validation"]
        tr, va, te = slice(0, ntrain), slice(ntrain, ntrain + nval), slice(ntrain + nval, len(samples))
        seen = set(keys[tr])
        masks = {"all": np.ones(counts["test"], bool),
                 "opening": np.array([sample["ply"] < 24 for sample in samples[te]]),
                 "familiar": np.array([key in seen for key in keys[te]]),
                 "novel": np.array([key not in seen for key in keys[te]])}
        rating = int(np.clip(round(player["medianRating"] / 100) * 100, 1000, 2200))
        identity = hashlib.sha256(json.dumps(samples).encode() + prepared.read_bytes()).hexdigest()
        cache = args.output / f"{name}-{rating}-features.npz"
        if cache.exists():
            with np.load(cache) as saved:
                if str(saved["identity"]) != identity:
                    raise ValueError(f"Stale imitation cache {cache}")
                features = {key: saved[key] for key in ["base", "64", "512"]}
        else:
            features = features_for(runtime, tokens, rating)
            np.savez_compressed(cache, identity=identity, **features)
        base = features["base"]
        base_prob = softmax(base[te], legal[te])
        baseline, base_losses = row_metrics(base_prob, targets[te])
        result = {"name": name, "sourceGames": player["sourceGames"], "medianSourceRating": player["medianRating"],
                  "matchedRating": rating, "counts": counts, "base": {}, "variants": {}, "selected": {}}
        for group, mask in masks.items():
            if mask.any():
                result["base"][group] = row_metrics(base_prob[mask], targets[te][mask])[0]
        selected_score = float("inf")
        for variant, width, optimizer, rate in VARIANTS:
            pack = torch_pack(features[str(width)][tr], base[tr], legal[tr], targets[tr], "cuda")
            validation = torch_pack(features[str(width)][va], base[va], legal[va], targets[va], "cuda")
            matrix, bias, training = fit(pack, validation, 0, epochs=args.epochs,
                                         optimizer_name=optimizer, learning_rate=rate)
            del pack, validation
            all_logits = base + features[str(width)] @ matrix + bias
            train_prob = softmax(all_logits[tr], legal[tr])
            repertoire = build_repertoire(samples[tr], keys[tr], train_prob, targets[tr])
            options = []
            for strength in [0, 0.5, 1]:
                values = apply_repertoire(all_logits[va], keys[va], repertoire, strength)
                score = row_metrics(softmax(values, legal[va]), targets[va])[0]["crossEntropy"]
                options.append((score, strength))
            score, strength = min(options)
            option_report = {"training": training, "openingStrength": strength, "validationLossWithOpenings": score,
                             "repertoirePositions": len(repertoire), "test": {}}
            test_prob = softmax(apply_repertoire(all_logits[te], keys[te], repertoire, strength), legal[te])
            for group, mask in masks.items():
                if mask.any():
                    summary, losses = row_metrics(test_prob[mask], targets[te][mask])
                    summary["lossChange95"] = paired_interval([sample for sample, yes in zip(samples[te], mask) if yes],
                                                              losses - base_losses[mask])
                    option_report["test"][group] = summary
            # Keep the no opening comparison to distinguish memory from generalization.
            option_report["testWithoutRepertoire"] = row_metrics(softmax(all_logits[te], legal[te]), targets[te])[0]
            result["variants"][variant] = option_report
            if score < selected_score:
                selected_score = score
                chosen = (variant, width, matrix.copy(), bias.copy(), repertoire, strength)
            print(name, variant, "base", round(baseline["moveMatch"], 3),
                  "learned", round(option_report["test"]["all"]["moveMatch"], 3),
                  "opening", strength, "epoch", training["bestEpoch"], flush=True)
        variant, width, matrix, bias, repertoire, strength = chosen
        result["selected"] = {"variant": variant, **result["variants"][variant]}
        np.savez_compressed(args.output / f"{name}-selected-adapter.npz", matrix=matrix, bias=bias,
                            keys=np.array(list(repertoire)),
                            deltas=np.array(list(repertoire.values())) if repertoire else np.zeros((0, WIDTH), np.float32),
                            strength=strength, width=width, elo=rating)
        result["transfer"] = {}
        for offset in [-400, 0, 400]:
            elo = int(np.clip(rating + offset, 600, 2600))
            transfer_features = features if offset == 0 else features_for(runtime, tokens[te], elo)
            subset = te if offset == 0 else slice(None)
            base_values = transfer_features["base"][subset]
            predicted_values = base_values + transfer_features[str(width)][subset] @ matrix + bias
            predicted_values = apply_repertoire(predicted_values, keys[te], repertoire, strength)
            p = softmax(predicted_values, legal[te])
            reference = softmax(base_values, legal[te])
            result["transfer"][str(elo)] = {
                "base": row_metrics(reference, targets[te])[0],
                "personal": row_metrics(p, targets[te])[0],
                "lossChange95": paired_interval(samples[te], row_metrics(p, targets[te])[1] - row_metrics(reference, targets[te])[1])
            }
            for i, sample in enumerate(samples[te]):
                prediction_rows.append({"player": name, "game": sample["gameId"], "elo": elo,
                                        "ply": sample["ply"], "fen": sample["fen"], "observed": sample["move"],
                                        "familiar": keys[te][i] in seen,
                                        "baseLoss": float(-np.log(max(float(reference[i, targets[te][i]]), 1e-30))),
                                        "personalLoss": float(-np.log(max(float(p[i, targets[te][i]]), 1e-30))),
                                        "baseMatch": int(reference[i].argmax()) == int(targets[te][i]),
                                        "personalMatch": int(p[i].argmax()) == int(targets[te][i])})
        report["players"].append(result)
        (args.output / "imitation-report.json").write_text(json.dumps(report, indent=2))
    with (args.output / "imitation-predictions.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(prediction_rows[0]))
        writer.writeheader()
        writer.writerows(prediction_rows)


if __name__ == "__main__":
    main()
