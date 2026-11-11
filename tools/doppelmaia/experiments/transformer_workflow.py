"""Reproduce the complete browser full-model epoch and checkpoint protocol on CUDA."""

import argparse
import hashlib
import json
from pathlib import Path
import time

import chess
import numpy as np
import torch
import torch.nn.functional as F

from finetune_model import Maia3
from finetune_study import MODEL, save_json
from native_data import position_key
from native_study import encode


def epoch_order(length, epoch, seed=42):
    state = (seed + epoch) & 0xFFFFFFFF
    order = list(range(length))
    for i in range(length - 1, 0, -1):
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        j = state % (i + 1)
        order[i], order[j] = order[j], order[i]
    return order


def capture_step(model, optimizer, x, masks, targets, elos, size, clip_norm):
    static_x, static_mask = x[:size].clone(), masks[:size].clone()
    static_targets, static_elo = targets[:size].clone(), elos[:size].clone()
    parameters = [p for p in model.parameters() if p.requires_grad]
    original = [p.detach().clone() for p in parameters]

    def update():
        optimizer.zero_grad(set_to_none=False)
        logits = model(static_x, static_elo, static_elo)[0].masked_fill(~static_mask, -1e9)
        loss = -(static_targets * logits.log_softmax(-1)).sum(-1).mean()
        loss.backward()
        norm = torch.nn.utils.clip_grad_norm_(parameters, clip_norm)
        optimizer.step()
        return loss.detach(), norm.detach()

    stream = torch.cuda.Stream()
    stream.wait_stream(torch.cuda.current_stream())
    with torch.cuda.stream(stream):
        for _ in range(3):
            update()
    torch.cuda.current_stream().wait_stream(stream)
    graph = torch.cuda.CUDAGraph()
    with torch.cuda.graph(graph):
        loss, norm = update()
    with torch.no_grad():
        for parameter, initial in zip(parameters, original):
            parameter.copy_(initial)
            for value in optimizer.state[parameter].values():
                if isinstance(value, torch.Tensor):
                    value.zero_()
    del original

    def replay(ids):
        static_x.copy_(x[ids])
        static_mask.copy_(masks[ids])
        static_targets.copy_(targets[ids])
        static_elo.copy_(elos[ids])
        graph.replay()
        return loss, norm

    return replay


def fit_full(model, training, validation, elo, options, on_epoch=None, cuda_graphs=False):
    batch = options["batchSize"]
    samples = training + validation
    tokens, legal, targets = encode(samples)
    x = torch.tensor(tokens, device="cuda")
    masks = torch.tensor(legal, device="cuda")
    labels = torch.tensor(targets, device="cuda")
    elos = torch.full((len(samples),), elo, dtype=torch.float32, device="cuda")
    seen = {position_key(chess.Board(sample["fen"])) for sample in training}
    novel = np.array([position_key(chess.Board(sample["fen"])) not in seen for sample in validation])
    if not novel.any():
        raise ValueError("No novel validation rows")
    selected = np.flatnonzero(novel) + len(training)
    all_train = np.arange(len(training))

    @torch.no_grad()
    def predict(indices):
        values = []
        for start in range(0, len(indices), batch):
            ids = indices[start:start + batch]
            logits = model(x[ids], elos[ids], elos[ids])[0]
            values.append(logits.masked_fill(~masks[ids], -1e9))
        return torch.cat(values)

    @torch.no_grad()
    def measure(indices):
        logits = predict(indices)
        return {"loss": float(F.cross_entropy(logits, labels[indices])),
                "accuracy": float((logits.argmax(-1) == labels[indices]).float().mean())}

    model.configure(8)
    teacher = predict(all_train).softmax(-1)
    soft_targets = options["baseAnchor"] * teacher + (1 - options["baseAnchor"]) * F.one_hot(labels[:len(training)], 4352).float()
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],
                                 lr=options["learningRate"], weight_decay=options.get("weightDecay", 0.01),
                                 foreach=False, capturable=cuda_graphs)
    replay = capture_step(model, optimizer, x, masks, soft_targets, elos, batch, options.get("clipNorm", 1)) if cuda_graphs and len(training) >= batch else None
    history = []
    best_loss, best_epoch, stale, updates = float("inf"), 0, 0, 0
    best = None
    started = time.perf_counter()
    for epoch in range(options["epochs"] + 1):
        if epoch:
            order = epoch_order(len(training), epoch, options.get("seed", 42))
            for start in range(0, len(order), batch):
                ids = torch.tensor(order[start:start + batch], device="cuda")
                if replay and len(ids) == batch:
                    loss, norm = replay(ids)
                else:
                    optimizer.zero_grad(set_to_none=not cuda_graphs)
                    logits = model(x[ids], elos[ids], elos[ids])[0].masked_fill(~masks[ids], -1e9)
                    loss = -(soft_targets[ids] * logits.log_softmax(-1)).sum(-1).mean()
                    if not torch.isfinite(loss):
                        raise ValueError("Nonfinite full training objective")
                    loss.backward()
                    norm = torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], options.get("clipNorm", 1))
                    if not torch.isfinite(norm):
                        raise ValueError("Nonfinite full training gradients")
                    optimizer.step()
                if not torch.isfinite(loss):
                    raise ValueError("Nonfinite full training objective")
                if not torch.isfinite(norm):
                    raise ValueError("Nonfinite full training gradients")
                updates += 1
        tr, va = measure(all_train), measure(selected)
        point = {"epoch": epoch, "trainLoss": tr["loss"], "trainAccuracy": tr["accuracy"],
                 "validationLoss": va["loss"], "validationAccuracy": va["accuracy"]}
        history.append(point)
        if on_epoch:
            on_epoch(point)
        if point["validationLoss"] < best_loss - 1e-5:
            best_loss, best_epoch, stale = point["validationLoss"], epoch, 0
            best = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        else:
            stale += 1
        if stale >= options["patience"]:
            break
    if best is None:
        raise AssertionError("Baseline checkpoint was not captured")
    model.load_state_dict(best)
    return {"options": options, "history": history, "bestEpoch": best_epoch, "exportedObjectiveLoss": best_loss,
            "updates": updates, "selectionMetric": "Training unseen board validation cross entropy, including epoch zero",
            "trainPositions": len(training), "validationPositions": len(validation), "novelValidationPositions": int(novel.sum()),
            "seconds": time.perf_counter() - started, "execution": "cuda-graphs" if cuda_graphs else "eager",
            "exportedMetrics": measure(np.arange(len(training), len(samples)))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--player", type=int, default=4)
    parser.add_argument("--train", type=int, default=1024)
    parser.add_argument("--validation", type=int, default=256)
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--cuda-graphs", action="store_true")
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required")
    torch.set_num_threads(6)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.manual_seed(42)
    player = json.loads(args.dataset.read_text())["players"][args.player - 1]
    pick = lambda rows, cap: [rows[i] for i in np.linspace(0, len(rows) - 1, min(cap, len(rows)), dtype=int)]
    training = pick(player["splits"]["train"]["samples"], args.train)
    validation = pick(player["splits"]["validation"]["samples"], args.validation)
    elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
    options = {"method": "full", "epochs": args.epochs, "learningRate": args.lr, "batchSize": 16,
               "patience": 2, "baseAnchor": 0.25, "weightDecay": 0.01, "clipNorm": 1, "seed": 42}
    case = {"provider": "webgpu", "elo": elo, "goal": "imitate", "options": options,
            "dataset": {"player": player["name"], "train": {"samples": training}, "validation": {"samples": validation}}}
    args.output.mkdir(parents=True, exist_ok=True)
    save_json(args.output / "workflow.json", case)
    model = Maia3(MODEL).cuda()
    report = fit_full(model, training, validation, elo, options, lambda point: print(json.dumps(point), flush=True), args.cuda_graphs)
    report["modelSHA256"] = hashlib.sha256(MODEL.read_bytes()).hexdigest()
    report["datasetSHA256"] = hashlib.sha256(args.dataset.read_bytes()).hexdigest()
    report["device"] = torch.cuda.get_device_name()
    model.export(args.output / "cuda.onnx")
    save_json(args.output / "cuda-report.json", report)
    print(json.dumps({"selected": report["bestEpoch"], "seconds": report["seconds"]}), flush=True)


if __name__ == "__main__":
    main()
