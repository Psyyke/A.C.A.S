"""CUDA Maia3 transformer fine-tuning with chronological, novel-board selection."""

import argparse
from collections import Counter, defaultdict
import gc
import hashlib
import json
from pathlib import Path
import time

import chess
import numpy as np
import onnxruntime as ort
import torch
import torch.nn.functional as F

from finetune_model import Maia3
from imitation_study import row_metrics, softmax
from native_data import position_key
from native_study import ROOT, encode, feeds, fit, paired_interval, session, torch_pack


MODEL = ROOT / r"app\assets\engines\Maia3\model\maia3_simplified.onnx"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_json(path, value):
    pending = path.with_suffix(".pending.json")
    pending.write_text(json.dumps(value, indent=2), encoding="utf-8")
    pending.replace(path)


@torch.no_grad()
def predict(model, tokens, rating, batch=64, prefix=None):
    logits, values, features = [], [], []
    for start in range(0, len(tokens), batch):
        x = torch.tensor(tokens[start:start + batch], device="cuda")
        elo = torch.full((len(x),), rating, dtype=torch.float32, device="cuda")
        if prefix is None:
            output = model(x, elo, elo)
        else:
            x = torch.tensor(prefix[start:start + batch], device="cuda")
            for index in range(model.first_train_layer, 8):
                x = model.block(x, index)
            output = model.heads(x)
        for rows, value in zip([logits, values, features], output):
            rows.append(value.cpu().numpy())
    return tuple(np.concatenate(rows) for rows in (logits, values, features))


@torch.no_grad()
def make_prefix(model, tokens, rating, blocks):
    result = np.empty((len(tokens), 64, 512), np.float32)
    for start in range(0, len(tokens), 64):
        x = torch.tensor(tokens[start:start + 64], device="cuda")
        elo = torch.full((len(x),), rating, dtype=torch.float32, device="cuda")
        x = model.embedding(x, elo, elo)
        for index in range(8 - blocks):
            x = model.block(x, index)
        result[start:start + len(x)] = x.cpu().numpy()
    return result


def ambiguity(keys, targets):
    groups = defaultdict(Counter)
    for key, target in zip(keys, targets):
        groups[key][int(target)] += 1
    return {"positions": len(keys), "uniqueInputs": len(groups),
            "conflictingInputs": sum(len(counts) > 1 for counts in groups.values()),
            "conflictingRows": sum(sum(counts.values()) for counts in groups.values() if len(counts) > 1),
            "empiricalDeterministicOracleTop1": sum(max(counts.values()) for counts in groups.values()) / len(keys),
            "warning": "Descriptive in-sample oracle, not a population ceiling; single observed choices cannot prove determinism."}


def summarize(logits, base, legal, targets, samples, masks):
    probabilities, reference = softmax(logits, legal), softmax(base, legal)
    results = {}
    for group, mask in masks.items():
        if not mask.any():
            continue
        metric, loss = row_metrics(probabilities[mask], targets[mask])
        base_loss = row_metrics(reference[mask], targets[mask])[1]
        rows = [sample for sample, yes in zip(samples, mask) if yes]
        metric["CEChange95"] = paired_interval(rows, loss - base_loss)
        difference = ((probabilities[mask].argmax(1) == targets[mask]).astype(float)
                      - (reference[mask].argmax(1) == targets[mask]).astype(float))
        metric["top1Change95"] = paired_interval(rows, difference)
        results[group] = metric
    return results


def parity(model, runtime, tokens, ratings):
    result = []
    for rating in ratings:
        with torch.no_grad():
            values = predict(model, tokens, rating, batch=4)
        expected = runtime.run(None, feeds(tokens, rating))
        errors = [float(np.max(np.abs(actual - reference))) for actual, reference in zip(values, expected)]
        if max(errors) > 0.0005:
            raise AssertionError(f"FP32 native/ONNX parity failed: {rating}, {errors}")
        result.append({"elo": rating, "policyMaximumAbsoluteError": errors[0],
                       "valueMaximumAbsoluteError": errors[1]})
    return result


def train_candidate(model, tokens, legal, targets, base, rating, validation_mask, ntrain,
                    config, output, epochs, batch, prefix):
    torch.manual_seed(42)
    trainable = model.configure(config["blocks"])
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],
                                 lr=config["lr"], weight_decay=0.01)
    selected = np.flatnonzero(validation_mask) + ntrain
    va_logits = base[selected]
    best_loss = row_metrics(softmax(va_logits, legal[selected]), targets[selected])[0]["crossEntropy"]
    best_epoch, stale = 0, 0
    checkpoint = output / (config["id"] + ".pt")
    torch.save(model.state_dict(), checkpoint)
    history = [{"epoch": 0, "novelValidationCE": best_loss,
                "novelValidationTop1": row_metrics(softmax(va_logits, legal[selected]), targets[selected])[0]["moveMatch"]}]
    teacher = torch.tensor(softmax(base[:ntrain], legal[:ntrain]), device="cuda")
    mask_gpu = torch.tensor(legal[:ntrain], device="cuda")
    target_gpu = torch.tensor(targets[:ntrain], device="cuda")
    if config.get("randomLabels"):
        generator = torch.Generator(device="cuda").manual_seed(77123)
        target_gpu = torch.multinomial(mask_gpu.float(), 1, generator=generator).squeeze(1)
    gradient = None
    started = time.perf_counter()
    for epoch in range(1, epochs + 1):
        order = np.random.default_rng(42 + epoch).permutation(ntrain)
        total_loss = 0.0
        for indices in np.array_split(order, np.arange(batch, ntrain, batch)):
            ids = torch.tensor(indices, device="cuda")
            optimizer.zero_grad(set_to_none=True)
            if prefix is not None:
                x = torch.tensor(prefix[indices], device="cuda")
                for index in range(model.first_train_layer, 8):
                    x = model.block(x, index)
                logits = model.heads(x)[0]
            else:
                x = torch.tensor(tokens[indices], device="cuda")
                elo = torch.full((len(x),), rating, dtype=torch.float32, device="cuda")
                logits = model(x, elo, elo)[0]
            logits = logits.masked_fill(~mask_gpu[ids], -1e9)
            logp = logits.log_softmax(-1)
            loss = ((1 - config["anchor"]) * F.nll_loss(logp, target_gpu[ids])
                    - config["anchor"] * (teacher[ids] * logp).sum(-1).mean())
            if not torch.isfinite(loss):
                raise ValueError("Nonfinite transformer loss")
            loss.backward()
            if gradient is None:
                names = [name for name in model.keys if f"layers.{8 - config['blocks']}." in name]
                norms = {name: float(model.w(name).grad.norm()) for name in names
                         if model.w(name).requires_grad and model.w(name).grad is not None}
                if not norms or max(norms.values()) <= 0:
                    raise AssertionError("Transformer backward had no nonzero gradient")
                gradient = norms
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
            optimizer.step()
            total_loss += float(loss.detach()) * len(indices)
        vp = prefix[selected] if prefix is not None else None
        logits = predict(model, tokens[selected], rating, batch=batch, prefix=vp)[0]
        measured = row_metrics(softmax(logits, legal[selected]), targets[selected])[0]
        history.append({"epoch": epoch, "trainObjective": total_loss / ntrain,
                        "novelValidationCE": measured["crossEntropy"], "novelValidationTop1": measured["moveMatch"]})
        print(output.name, config["id"], history[-1], flush=True)
        if measured["crossEntropy"] < best_loss - 1e-5:
            best_loss, best_epoch, stale = measured["crossEntropy"], epoch, 0
            torch.save(model.state_dict(), checkpoint)
        else:
            stale += 1
        if stale >= 2:
            break
    result = {**config, "trainableParameters": trainable, "bestEpoch": best_epoch,
              "selectedNovelValidationCE": best_loss, "history": history, "transformerGradientNorms": gradient,
              "seconds": time.perf_counter() - started, "checkpoint": str(checkpoint)}
    save_json(output / (config["id"] + ".json"), result)
    del optimizer, teacher, mask_gpu, target_gpu
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", type=int, default=3)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch", type=int, default=32)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required; no silent CPU fallback")
    ort.preload_dlls()
    data = json.loads(args.dataset.read_text())
    configs = [{"id": f"blocks{blocks}-lr{lr:g}", "blocks": blocks, "lr": lr, "anchor": 0.25}
               for blocks, lr in [(1, 1e-5), (1, 3e-5), (8, 1e-5), (8, 3e-5)]]
    configs.append({"id": "random-label-control", "blocks": 1, "lr": 1e-5, "anchor": 0.25, "randomLabels": True})
    protocol = {"version": 3, "datasetSHA256": digest(args.dataset), "modelSHA256": digest(MODEL),
                "device": torch.cuda.get_device_name(), "torch": torch.__version__, "batchSize": args.batch,
                "maxEpochs": args.epochs, "configs": configs,
                "selection": "Minimum train-unseen canonical-board validation CE, including epoch zero. Sealed tests never select.",
                "optimizer": "AdamW, weight decay .01, global gradient clip 1, FP32, seed42",
                "partialFreeze": "All initializers consumed by cached prefix frozen, including shared GAB; full8 updates shared GAB",
                "comparison": "Exact source chronological train/validation/test samples; tanh pooled adapter features; no opening memory; no test updates",
                "splitNovelty": "novel excludes train; strictNovel excludes train AND validation; board key is exactly canonical piece input",
                "limitations": "Activity-selected prolific-player cohort, initially three then unchanged-protocol broadening; prior archive studies not independent; no measured Elo or perfect imitation claim"}
    protocol_path = args.output / "protocol.json"
    if protocol_path.exists() and json.loads(protocol_path.read_text()) != protocol:
        raise ValueError("Existing candidate directory belongs to a different source or protocol")
    if not protocol_path.exists():
        save_json(protocol_path, protocol)
    report_path = args.output / "finetune-report.json"
    report = {"protocol": protocol, "players": []}
    if report_path.exists():
        report = json.loads(report_path.read_text())
        if report["protocol"] != protocol:
            raise ValueError("Existing report protocol differs")
    completed = {p["name"] for p in report["players"]}
    model = Maia3(MODEL).cuda()
    base_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
    base_path = args.output / "base-f32.onnx"
    model.export(base_path)
    runtime = session(base_path, True)
    for player in data["players"][:args.players]:
        if player["name"] in completed:
            continue
        output = args.output / player["name"]
        output.mkdir(exist_ok=True)
        splits = [player["splits"][name]["samples"] for name in ["train", "validation", "test"]]
        samples = sum(splits, [])
        ntrain, nval, ntest = map(len, splits)
        boundaries = (ntrain, ntrain + nval)
        tr, va, te = slice(0, ntrain), slice(*boundaries), slice(ntrain + nval, None)
        tokens, legal, targets = encode(samples)
        keys = [position_key(chess.Board(s["fen"])) for s in samples]
        seen, selection_seen = set(keys[tr]), set(keys[:ntrain + nval])
        novel_validation = np.array([key not in seen for key in keys[va]])
        if novel_validation.sum() < 100:
            raise ValueError("Insufficient independent novel validation boards")
        masks = {"all": np.ones(ntest, bool), "novel": np.array([key not in seen for key in keys[te]]),
                 "strictNovel": np.array([key not in selection_seen for key in keys[te]]),
                 "familiar": np.array([key in seen for key in keys[te]]),
                 "opening": np.array([s["ply"] < 24 for s in splits[2]])}
        rating = int(np.clip(round(player["medianRating"] / 100) * 100, 1000, 2200))
        model.load_state_dict(base_state)
        model.configure(0)
        base, value_base, features = predict(model, tokens, rating)
        features = np.tanh(features)
        check_tokens = tokens[np.linspace(0, len(tokens) - 1, 8, dtype=int)]
        initial_parity = parity(model, runtime, check_tokens, [1000, rating, 2200])
        player_report = {"name": player["name"], "sourceGames": player["sourceGames"], "rating": rating,
                         "counts": dict(zip(["train", "validation", "test"], map(len, splits))),
                         "novelValidationPositions": int(novel_validation.sum()),
                         "baselineParity": initial_parity, "ambiguityAll": ambiguity(keys, targets),
                         "ambiguityTrain": ambiguity(keys[tr], targets[tr]),
                         "base": summarize(base[te], base[te], legal[te], targets[te], splits[2], masks),
                         "candidates": [], "adapters": []}
        np.savez_compressed(output / "split-identity.npz", tokensSHA256=hashlib.sha256(tokens.tobytes()).hexdigest(),
                            targets=targets, novelValidation=novel_validation, **masks)
        # Identical 512-feature browser SGD reference, selected on the same novel validation rows.
        validation = torch_pack(features[va][novel_validation], base[va][novel_validation],
                                legal[va][novel_validation], targets[va][novel_validation], "cuda")
        train = torch_pack(features[tr], base[tr], legal[tr], targets[tr], "cuda")
        for anchor in [0, 0.5]:
            matrix, bias, training = fit(train, validation, anchor, epochs=40, learning_rate=0.005)
            vl = base[va][novel_validation] + features[va][novel_validation] @ matrix + bias
            val_ce = row_metrics(softmax(vl, legal[va][novel_validation]), targets[va][novel_validation])[0]["crossEntropy"]
            adapter = {"anchor": anchor, "training": training, "novelValidationCE": val_ce}
            np.savez_compressed(output / f"adapter-{anchor}.npz", matrix=matrix, bias=bias)
            player_report["adapters"].append(adapter)
        del train, validation
        prefix = make_prefix(model, tokens[:ntrain + nval], rating, 1)
        for config in configs:
            candidate_path = output / (config["id"] + ".json")
            if candidate_path.exists():
                candidate = json.loads(candidate_path.read_text())
            else:
                model.load_state_dict(base_state)
                candidate = train_candidate(model, tokens[:ntrain + nval], legal[:ntrain + nval],
                                            targets[:ntrain + nval], base[:ntrain + nval], rating,
                                            novel_validation, ntrain, config, output, args.epochs, args.batch,
                                            prefix if config["blocks"] == 1 else None)
            player_report["candidates"].append(candidate)
        del prefix
        # Persist every validation decision before evaluating any fine-tuned test predictions.
        selected = min([c for c in player_report["candidates"] if not c.get("randomLabels")],
                       key=lambda c: c["selectedNovelValidationCE"])
        adapter_selected = min(player_report["adapters"], key=lambda a: a["novelValidationCE"])
        player_report["selected"] = selected["id"]
        player_report["selectedAdapterAnchor"] = adapter_selected["anchor"]
        save_json(output / "validation-selection.json", player_report)
        predictions = {"base": base[te]}
        for candidate in player_report["candidates"]:
            model.configure(candidate["blocks"])
            model.load_state_dict(torch.load(candidate["checkpoint"], map_location="cuda", weights_only=True))
            prediction, values, _ = predict(model, tokens[te], rating)
            candidate["test"] = summarize(prediction, base[te], legal[te], targets[te], splits[2], masks)
            candidate["valueLogitsChange"] = {"maximum": float(np.abs(values - value_base[te]).max()),
                                             "meanAbsolute": float(np.abs(values - value_base[te]).mean()),
                                             "note": "Policy-only loss changes shared trunk, so value behavior is not preserved."}
            predictions[candidate["id"]] = prediction
            if candidate["id"] == selected["id"]:
                exported = output / "maia3-finetuned.onnx"
                model.export(exported)
                export_runtime = session(exported, True)
                player_report["exportParity"] = parity(model, export_runtime, check_tokens, [1000, rating, 2200])
                player_report["exportSHA256"] = digest(exported)
                player_report["exportPath"] = str(exported)
                changed = {name: float((model.w(name).detach().cpu() - torch.from_numpy(model.initial[name])).norm())
                           for name in model.keys if model.w(name).requires_grad}
                player_report["parameterChangeNorms"] = changed
                del export_runtime
        for adapter in player_report["adapters"]:
            with np.load(output / f"adapter-{adapter['anchor']}.npz") as weights:
                prediction = base[te] + features[te] @ weights["matrix"] + weights["bias"]
            adapter["test"] = summarize(prediction, base[te], legal[te], targets[te], splits[2], masks)
            predictions[f"adapter-{adapter['anchor']}"] = prediction
        np.savez_compressed(output / "sealed-test-predictions.npz", legal=legal[te], targets=targets[te],
                            **predictions)
        report["players"].append(player_report)
        save_json(report_path, report)
        print("COMPLETED", player["name"], "selected", selected["id"], "novel",
              selected["test"]["novel"], flush=True)
        del base, features, value_base, tokens, legal, predictions
        gc.collect()
    del runtime


if __name__ == "__main__":
    main()
