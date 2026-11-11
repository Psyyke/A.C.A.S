"""Export real CUDA forward, backward and AdamW references for browser training."""

import argparse
import hashlib
import json
from pathlib import Path
import time

import numpy as np
import torch

from finetune_model import Maia3
from context_models import history_tokens
from context_training import ContextTrainable
from finetune_study import MODEL, save_json
from native_study import encode


def save_tensors(path, tensors):
    offset, entries = 0, []
    with path.open("wb") as stream:
        for name, value in tensors:
            array = value.detach().cpu().contiguous().numpy().astype(np.float32)
            array.tofile(stream)
            entries.append({"name": name, "shape": list(array.shape), "offset": offset, "length": array.size})
            offset += array.size
    return {"file": path.name, "tensors": entries, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--batch", type=int, default=2)
    parser.add_argument("--rows", type=int, default=12)
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the browser parity reference")
    torch.set_num_threads(6)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.manual_seed(42)
    args.output.mkdir(parents=True, exist_ok=True)
    data = json.loads(args.dataset.read_text())
    samples = []
    for player in data["players"][:6]:
        rows = player["splits"]["train"]["samples"]
        indices = np.linspace(0, len(rows) - 1, (args.rows + 5) // 6, dtype=int)
        samples.extend(rows[index] for index in indices)
    samples = samples[:args.rows]
    tokens, legal, targets = history_tokens(samples) if args.history else encode(samples)
    inputs = torch.tensor(tokens, device="cuda")
    mask = torch.tensor(legal, device="cuda")
    labels = torch.tensor(targets, device="cuda")
    elos = torch.tensor(np.resize(np.array([1200, 1700, 2100], np.float32), len(samples)), device="cuda")
    opponents = torch.tensor(np.resize(np.array([1800, 1000, 2300], np.float32), len(samples)), device="cuda")
    model = (ContextTrainable(MODEL) if args.history else Maia3(MODEL)).cuda()
    model.configure(8)
    with torch.no_grad():
        baseline, value, _ = model(inputs, elos, opponents)
        teacher = baseline.masked_fill(~mask, -1e9).softmax(-1)
        soft_targets = 0.25 * teacher + 0.75 * torch.nn.functional.one_hot(labels, 4352).float()
    report = {
        "version": 1, "tokenChannels": 96 if args.history else 12,
        "modelSHA256": hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        "datasetSHA256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
        "device": torch.cuda.get_device_name(), "torch": torch.__version__,
        "samples": samples, "eloSelf": elos.cpu().tolist(), "eloOppo": opponents.cpu().tolist(),
        "baseline": baseline.cpu().tolist(), "baselineValue": value.cpu().tolist(),
        "targets": soft_targets.cpu().tolist(),
        "options": {"learningRate": 0.00003, "weightDecay": 0.01, "clipNorm": 1},
        "steps": []
    }
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],
                                 lr=3e-5, weight_decay=0.01, foreach=False)
    order = np.random.default_rng(42).permutation(len(samples))
    started = time.perf_counter()
    for step in range(args.steps):
        begin = (step * args.batch) % len(samples)
        indices = order[begin:begin + args.batch]
        optimizer.zero_grad(set_to_none=True)
        logits = model(inputs[indices], elos[indices], opponents[indices])[0]
        logp = logits.masked_fill(~mask[indices], -1e9).log_softmax(-1)
        loss = -(soft_targets[indices] * logp).sum(-1).mean()
        loss.backward()
        if step == 0:
            report["gradients"] = save_tensors(args.output / "gradients.bin",
                                              ((name, model.w(name).grad) for name in model.keys
                                               if model.w(name).requires_grad))
        norm = torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1)
        optimizer.step()
        report["steps"].append({"indices": indices.tolist(), "loss": float(loss.detach()),
                                "gradientNorm": float(norm)})
        if step == 0:
            report["firstWeights"] = save_tensors(args.output / "first-weights.bin",
                                                  ((name, model.w(name)) for name in model.keys))
    with torch.no_grad():
        final, final_value, _ = model(inputs, elos, opponents)
    report["final"] = final.cpu().tolist()
    report["finalValue"] = final_value.cpu().tolist()
    report["weights"] = save_tensors(args.output / "weights.bin", ((name, model.w(name)) for name in model.keys))
    report["seconds"] = time.perf_counter() - started
    model.export(args.output / "cuda.onnx")
    save_json(args.output / "reference.json", report)
    print(json.dumps({"rows": len(samples), "steps": args.steps, "seconds": report["seconds"],
                      "firstLoss": report["steps"][0]["loss"], "lastLoss": report["steps"][-1]["loss"]}), flush=True)


if __name__ == "__main__":
    main()
