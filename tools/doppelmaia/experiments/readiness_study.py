"""Larger fixed browser-method study, learning curves and rating transfer."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import hashlib
import json
from pathlib import Path
import subprocess

import chess
import numpy as np
import onnxruntime as ort
import torch

from imitation_study import apply_repertoire, build_repertoire, row_metrics, softmax
from native_data import position_key
from native_study import ROOT, BRIDGE, MOVES, TRAITS, canonical_move, encode, extract, fit, paired_interval, session, torch_pack, score_position


def add_repertoire(train_samples, train_keys, train_probs, train_targets,
                   validation_values, validation_keys, validation_legal, validation_targets, anchor):
    repertoire = build_repertoire(train_samples, train_keys, train_probs, train_targets, anchor)
    options = [(row_metrics(softmax(apply_repertoire(validation_values, validation_keys, repertoire, strength),
                                   validation_legal), validation_targets)[0]["crossEntropy"], strength)
               for strength in [0, 0.5, 1]]
    _, strength = min(options)
    return repertoire, strength


def trait_matrix(samples):
    rows, indices, values, observed = [], [], [], []
    for row, sample in enumerate(samples):
        board = chess.Board(sample["fen"])
        for uci in sample["legalMoves"]:
            move = chess.Move.from_uci(uci)
            trait = [board.piece_type_at(move.from_square) == chess.KNIGHT,
                     board.piece_type_at(move.from_square) == chess.PAWN,
                     board.is_capture(move), board.gives_check(move), board.is_castling(move)]
            rows.append(row)
            indices.append(MOVES[canonical_move(uci, not board.turn)])
            values.append(trait)
            if uci == sample["move"]:
                observed.append(trait)
    return np.array(rows), np.array(indices), np.array(values, np.float32), np.mean(observed, axis=0)


def trait_error(p, traits):
    rows, indices, values, observed = traits
    predicted = (p[rows, indices, None] * values).sum(0) / p.shape[0]
    return {"meanAbsoluteError": float(np.abs(predicted - observed).mean()),
            "observed": dict(zip(TRAITS, observed.tolist())),
            "predicted": dict(zip(TRAITS, predicted.tolist()))}


def summarize(p, reference, targets, samples, masks, traits):
    result = {}
    for group, mask in masks.items():
        if mask.any():
            measured, losses = row_metrics(p[mask], targets[mask])
            base_losses = row_metrics(reference[mask], targets[mask])[1]
            measured["lossChange95"] = paired_interval([sample for sample, yes in zip(samples, mask) if yes], losses - base_losses)
            result[group] = measured
    result["traits"] = trait_error(p, traits)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--stockfish", type=Path)
    parser.add_argument("--quality-workers", type=int, default=2)
    args = parser.parse_args()
    if not 1 <= args.quality_workers <= 8:
        raise ValueError("Use one to eight quality workers")
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    torch.backends.cuda.matmul.allow_tf32 = False
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required")
    ort.preload_dlls()
    prepared = args.output / "browser-full512-features.onnx"
    subprocess.run(["node", str(BRIDGE), "prepare", str(ROOT / "app/assets/engines/Maia3/model/maia3_simplified.onnx"),
                    str(prepared), "512"], check=True)
    runtime = session(prepared, True)
    data = json.loads(args.dataset.read_text())
    identity = hashlib.sha256(args.dataset.read_bytes() + prepared.read_bytes()).hexdigest()
    report = {"version": 1, "datasetSHA256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
              "protocol": {"featureSize": 512, "epochs": args.epochs, "learningRate": 0.005, "batchSize": 32,
                           "seed": 42, "openingStrengths": [0, 0.5, 1], "eloOffsets": [-200, 0, 200],
                           "settings": ["1000-max", "3000-max", "full-max", "full-balanced", "full-prefer-base", "random-labels"],
                           "selection": "Each setting has independent validation checkpoint and opening blend. No selection using tests.",
                           "limitation": "Not independent of earlier archive studies, not a measured Elo or near perfect human imitation claim"},
              "source": {key: value for key, value in data.items() if key != "players"}, "players": []}
    report_path = args.output / "readiness-report.json"
    prediction_rows = []
    if report_path.exists():
        existing = json.loads(report_path.read_text())
        if existing["datasetSHA256"] != report["datasetSHA256"] or existing["protocol"] != report["protocol"]:
            raise ValueError("Existing readiness results have a different source or protocol")
        report = existing
        with (args.output / "readiness-predictions.csv").open(newline="", encoding="utf-8") as file:
            prediction_rows = list(csv.DictReader(file))
    completed = {player["name"] for player in report["players"]}
    prediction_rows = [row for row in prediction_rows if row["player"] in completed]
    for player in data["players"]:
        name, splits = player["name"], player["splits"]
        if name in completed:
            print(name, "already completed with the same protocol", flush=True)
            continue
        counts = {key: len(splits[key]["samples"]) for key in ["train", "validation", "test"]}
        samples = sum([splits[key]["samples"] for key in counts], [])
        tokens, legal, targets = encode(samples)
        keys = [position_key(chess.Board(sample["fen"])) for sample in samples]
        ntrain, nval = counts["train"], counts["validation"]
        tr, va, te = slice(0, ntrain), slice(ntrain, ntrain + nval), slice(ntrain + nval, len(samples))
        rating = int(np.clip(round(player["medianRating"] / 100) * 100, 1000, 2200))
        path = args.output / f"{name}-{rating}-cache.npz"
        if path.exists():
            with np.load(path) as cached:
                if str(cached["identity"]) != identity:
                    raise ValueError(f"Stale readiness cache {path}")
                features, base = cached["features"], cached["base"]
        else:
            features, base = extract(runtime, tokens, rating, 128)
            pending = path.with_suffix(".pending.npz")
            np.savez_compressed(pending, identity=identity, features=features, base=base)
            pending.replace(path)
        seen = set(keys[tr])
        masks = {"all": np.ones(counts["test"], bool),
                 "familiar": np.array([key in seen for key in keys[te]]),
                 "novel": np.array([key not in seen for key in keys[te]]),
                 "opening": np.array([sample["ply"] < 24 for sample in samples[te]])}
        traits = trait_matrix(samples[te])
        reference = softmax(base[te], legal[te])
        result = {"name": name, "sourceGames": player["sourceGames"], "medianSourceRating": player["medianRating"],
                  "matchedRating": rating, "counts": counts, "base": summarize(reference, reference, targets[te], samples[te], masks, traits),
                  "settings": {}, "transfer": {}}
        models = {}
        for label, budget, anchor, random_labels in [
            ("1000-max", 1000, 0, False), ("3000-max", 3000, 0, False), ("full-max", ntrain, 0, False),
            ("full-balanced", ntrain, 0.5, False), ("full-prefer-base", ntrain, 0.8, False),
            ("random-labels", ntrain, 0, True)
        ]:
            # Spread each budget across phases rather than taking only early games.
            chosen = np.unique(np.linspace(0, ntrain - 1, min(ntrain, budget)).round().astype(int))
            train = torch_pack(features[chosen], base[chosen], legal[chosen], targets[chosen], "cuda")
            validation = torch_pack(features[va], base[va], legal[va], targets[va], "cuda")
            matrix, bias, training = fit(train, validation, anchor, epochs=args.epochs,
                                         random_labels=random_labels, learning_rate=0.005)
            del train, validation
            all_values = base + features @ matrix + bias
            repertoire, strength = ({}, 0) if random_labels else add_repertoire(
                [samples[i] for i in chosen], [keys[i] for i in chosen], softmax(all_values[chosen], legal[chosen]),
                targets[chosen], all_values[va], keys[va], legal[va], targets[va], anchor)
            p = softmax(apply_repertoire(all_values[te], keys[te], repertoire, strength), legal[te])
            models[label] = (matrix, bias, repertoire, strength)
            result["settings"][label] = {"training": training, "trainingPositions": len(chosen),
                                         "anchor": anchor, "repertoirePositions": len(repertoire),
                                         "repertoireStrength": strength,
                                         "test": summarize(p, reference, targets[te], samples[te], masks, traits)}
            if label == "full-max":
                for i, sample in enumerate(samples[te]):
                    prediction_rows.append({"player": name, "gameId": sample["gameId"], "fen": sample["fen"],
                                            "observed": sample["move"], "familiar": keys[te][i] in seen,
                                            "baseProbability": float(reference[i, targets[te][i]]),
                                            "personalProbability": float(p[i, targets[te][i]]),
                                            "baseMatch": int(reference[i].argmax()) == int(targets[te][i]),
                                            "personalMatch": int(p[i].argmax()) == int(targets[te][i])})
            print(name, label, len(chosen), "epoch", training["bestEpoch"],
                  "agreement", round(result["settings"][label]["test"]["all"]["moveMatch"], 4), flush=True)
        unique_test = {}
        for i, key in enumerate(keys[te]):
            unique_test.setdefault(key, i)
        quality_indices = [list(unique_test.values())[i] for i in
                           np.linspace(0, len(unique_test) - 1, min(24, len(unique_test))).round().astype(int)]
        quality_samples = [samples[te][i] for i in quality_indices] if args.stockfish and len(report["players"]) < 5 else []
        quality = []
        if quality_samples:
            engine_hash = hashlib.sha256(args.stockfish.read_bytes()).hexdigest()
            quality_path = args.output / f"{name}-unique-quality.json"
            if quality_path.exists():
                quality = json.loads(quality_path.read_text())
                if len(quality) != len(quality_samples) or any(row["engineSHA256"] != engine_hash or row["fen"] != sample["fen"] for row, sample in zip(quality, quality_samples)):
                    raise ValueError("Stale quality cache")
            else:
                tasks = [(str(args.stockfish), sample["fen"], 250000, engine_hash) for sample in quality_samples]
                with ThreadPoolExecutor(max_workers=args.quality_workers) as pool:
                    quality = list(pool.map(score_position, tasks))
                quality_path.write_text(json.dumps(quality, indent=2))
            result["qualityStudy"] = {"positions": len(quality), "testIndices": quality_indices,
                                      "minimumDepth": min(row["minimumDepth"] for row in quality),
                                      "nodesPerPosition": 250000, "engineSHA256": engine_hash,
                                      "selection": "Even spread across unique canonical test boards"}
        for offset in [-200, 0, 200]:
            elo = rating + offset
            f, b = (features[te], base[te]) if offset == 0 else extract(runtime, tokens[te], elo, 128)
            base_p = softmax(b, legal[te])
            transfer = {"base": {"metrics": row_metrics(base_p, targets[te])[0], "traits": trait_error(base_p, traits)}}
            for label in ["full-max", "full-balanced", "full-prefer-base"]:
                matrix, bias, repertoire, strength = models[label]
                p = softmax(apply_repertoire(b + f @ matrix + bias, keys[te], repertoire, strength), legal[te])
                transfer[label] = {"metrics": row_metrics(p, targets[te])[0], "traits": trait_error(p, traits)}
                if quality:
                    for model_label, probabilities in [(label, p), ("base", base_p)]:
                        losses = []
                        for i, row in enumerate(quality):
                            black = quality_samples[i]["fen"].split()[1] == "b"
                            losses.append(sum(probabilities[quality_indices[i], MOVES[canonical_move(move, black)]] * loss
                                              for move, loss in row["losses"].items()))
                        transfer[model_label]["expectedCentipawnLoss"] = float(np.mean(losses))
                        transfer[model_label]["qualityPositions"] = len(losses)
            result["transfer"][str(elo)] = transfer
        matrix, bias, repertoire, strength = models["full-max"]
        np.savez_compressed(args.output / f"{name}-full-adapter.npz", matrix=matrix, bias=bias,
                            keys=np.array(list(repertoire)), deltas=np.array(list(repertoire.values())),
                            strength=strength, elo=rating)
        report["players"].append(result)
        pending_csv = args.output / "readiness-predictions.pending.csv"
        with pending_csv.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=list(prediction_rows[0]))
            writer.writeheader()
            writer.writerows(prediction_rows)
        pending_csv.replace(args.output / "readiness-predictions.csv")
        pending_report = report_path.with_suffix(".pending.json")
        pending_report.write_text(json.dumps(report, indent=2))
        pending_report.replace(report_path)


if __name__ == "__main__":
    main()
