"""Measure every browser personality with identical targets and CUDA SGD."""

import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
import onnxruntime as ort
import torch

from imitation_study import softmax
from native_study import ROOT, BRIDGE, MOVES, canonical_move, encode, extract, feeds, fit, paired_interval, session, torch_pack


def metrics(probabilities, target, scores):
    p = probabilities.astype(np.float64)
    q = target.astype(np.float64)
    kl = (q * (np.log(np.maximum(q, 1e-30)) - np.log(np.maximum(p, 1e-30)))).sum(1)
    score = (p * scores).sum(1)
    return {"KL": float(kl.mean()), "score": float(score.mean()),
            "teacherTopMoveMatch": float((p.argmax(1) == q.argmax(1)).mean())}, kl, score


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("practice", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--epochs", type=int, default=40)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    torch.backends.cuda.matmul.allow_tf32 = False
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required, not a CPU fallback")
    ort.preload_dlls()
    prepared = args.output / "maia3-personality-features.onnx"
    subprocess.run(["node", str(BRIDGE), "prepare",
                    str(ROOT / "app/assets/engines/Maia3/model/maia3_simplified.onnx"),
                    str(prepared), "512"], check=True)
    model_hash = hashlib.sha256(prepared.read_bytes()).hexdigest()
    source = json.loads(args.practice.read_text())
    splits = {key: source["dataset"][key]["samples"] for key in ["train", "validation"]}
    splits["test"] = source["test"]["samples"]
    samples = sum(splits.values(), [])
    tokens, legal, targets = encode(samples)
    ntrain, nval = len(splits["train"]), len(splits["validation"])
    tr, va, te = slice(0, ntrain), slice(ntrain, ntrain + nval), slice(ntrain + nval, len(samples))
    move_rows = sum(source["moveFeatures"].values(), [])
    # Keep the JS feature order and legal-move order instead of reimplementing chess traits.
    trait_values = np.concatenate([np.asarray(row, np.float32) for row in move_rows])
    row_indices = np.concatenate([np.full(len(row), i, dtype=np.int64) for i, row in enumerate(move_rows)])
    # encode() preserves sample.legalMoves order only in its mask, so map explicitly here.
    legal_indices = np.array([MOVES[canonical_move(move, sample["fen"].split()[1] == "b")]
                              for sample in samples for move in sample["legalMoves"]])
    runtime = session(prepared, True)

    @lru_cache(maxsize=2)
    def full_features(elo):
        cache = args.output / f"practice-{elo}-features.npz"
        identity = hashlib.sha256(args.practice.read_bytes() + str(elo).encode() + model_hash.encode()).hexdigest()
        if cache.exists():
            with np.load(cache) as data:
                if str(data["identity"]) != identity:
                    raise ValueError(f"Stale practice features {cache}")
                return data["features"], data["base"]
        features, base = extract(runtime, tokens, elo, 128)
        pending = cache.with_suffix(".pending.npz")
        np.savez_compressed(pending, identity=identity, features=features, base=base)
        pending.replace(cache)
        return features, base

    report = {"version": 1, "practiceSHA256": hashlib.sha256(args.practice.read_bytes()).hexdigest(),
              "preparedSHA256": model_hash,
              "protocol": {"target": "softmax(legal base logits + shared JavaScript personality scores)",
                           "features": 512, "optimizer": "SGD", "learningRate": 0.005, "batchSize": 32,
                           "momentum": 0.9, "weightDecay": 0.0001, "patience": 8, "epochs": args.epochs,
                           "seed": 42, "openingMemory": False,
                           "split": "Separate source games, every canonical board input unique across all splits",
                           "counts": {key: len(rows) for key, rows in splits.items()},
                           "limitation": "Synthetic soft preferences, not human copying or measured playing strength"},
              "profiles": []}
    for profile in source["presets"]:
        weights = np.array([profile["weights"][trait["id"]] for trait in source["traits"]], np.float32)
        scores = np.zeros_like(legal, dtype=np.float32)
        scores[row_indices, legal_indices] = (trait_values @ weights) * profile["strength"]
        features, base = full_features(profile["elo"])
        q = softmax(base + scores, legal)
        train = torch_pack(features[tr], base[tr], legal[tr], targets[tr], "cuda")
        validation = torch_pack(features[va], base[va], legal[va], targets[va], "cuda")
        matrix, bias, training = fit(train, validation, 0, epochs=args.epochs, learning_rate=0.005,
                                    soft_targets=torch.tensor(q[tr], device="cuda"),
                                    validation_targets=torch.tensor(q[va], device="cuda"))
        del train, validation
        p = softmax(base[te] + features[te] @ matrix + bias, legal[te])
        baseline = softmax(base[te], legal[te])
        before, base_kl, base_score = metrics(baseline, q[te], scores[te])
        after, personal_kl, personal_score = metrics(p, q[te], scores[te])
        score_interval = paired_interval(splits["test"], personal_score - base_score)
        kl_interval = paired_interval(splits["test"], personal_kl - base_kl)
        record = {"id": profile["id"], "name": profile["name"], "elo": profile["elo"],
                  "configuration": profile, "training": training, "base": before, "personal": after,
                  "scoreChange95": score_interval, "KLChange95": kl_interval,
                  "gapClosed": 1 - after["KL"] / before["KL"] if before["KL"] > 1e-9 else 0,
                  "transfer": {}}
        for offset in [-200, 200]:
            rating = profile["elo"] + offset
            f, b = full_features(rating)
            predicted = softmax(b[te] + f[te] @ matrix + bias, legal[te])
            reference = softmax(b[te], legal[te])
            teacher = softmax(b[te] + scores[te], legal[te])
            record["transfer"][str(rating)] = {
                "base": metrics(reference, teacher, scores[te])[0],
                "personal": metrics(predicted, teacher, scores[te])[0]}
        record["passed"] = (after["KL"] < before["KL"] and score_interval["low"] > 0
                            and kl_interval["high"] < 0 and all(
                                value["personal"]["score"] > value["base"]["score"]
                                for value in record["transfer"].values()))
        np.savez_compressed(args.output / f"{profile['id']}-adapter.npz", matrix=matrix, bias=bias)
        if profile["id"] in ["bunker", "knight-fan", "alien"]:
            binary = args.output / f"{profile['id']}.bin"
            exported = args.output / f"{profile['id']}.onnx"
            np.concatenate([matrix.ravel(), bias]).astype(np.float32).tofile(binary)
            subprocess.run(["node", str(BRIDGE), "export", str(prepared), str(exported), str(binary)], check=True)
            exported_runtime = session(exported, True)
            actual = exported_runtime.run(["logits_move"], feeds(tokens[te][:4], profile["elo"]))[0]
            expected = base[te][:4] + features[te][:4] @ matrix + bias
            error = float(np.max(np.abs(actual - expected)))
            if error > 0.002:
                raise ValueError(f"Personality export parity failed for {profile['id']}: {error}")
            record["exportMaximumLogitError"] = error
            record["exportSHA256"] = hashlib.sha256(exported.read_bytes()).hexdigest()
            binary.unlink()
            del exported_runtime
        report["profiles"].append(record)
        (args.output / "personality-report.json").write_text(json.dumps(report, indent=2))
        print(profile["id"], "KL", round(before["KL"], 3), "to", round(after["KL"], 3),
              "score", round(before["score"], 3), "to", round(after["score"], 3),
              "pass", record["passed"], flush=True)


if __name__ == "__main__":
    main()
