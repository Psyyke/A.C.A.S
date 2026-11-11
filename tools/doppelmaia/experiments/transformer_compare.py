"""Verify trained browser gradients and predictions at exactly the same CUDA weights."""

import argparse
import json
from pathlib import Path

import numpy as np
import torch

from finetune_model import Maia3
from finetune_study import save_json
from native_study import encode


def difference(actual, expected):
    a, b = actual.astype(np.float64).ravel(), expected.astype(np.float64).ravel()
    if a.shape != b.shape or not np.isfinite(a).all() or not np.isfinite(b).all():
        raise AssertionError("Invalid parity tensor dimensions or values")
    delta = a - b
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return {"maximum": float(np.max(np.abs(delta))), "rmse": float(np.sqrt(np.mean(delta ** 2))),
            "cosine": float(np.dot(a, b) / norm) if norm else float(np.array_equal(a, b))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required for common-state parity")
    torch.set_num_threads(6)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    reference = json.loads((args.study / "reference.json").read_text())
    model = Maia3(args.study / "browser.onnx").cuda()
    model.configure(8)
    tokens, legal, _ = encode(reference["samples"])
    inputs = torch.tensor(tokens, device="cuda")
    self_elo = torch.tensor(reference["eloSelf"], device="cuda")
    opponent = torch.tensor(reference["eloOppo"], device="cuda")
    logits, values = [], []
    with torch.no_grad():
        for start in range(0, len(tokens), 16):
            output = model(inputs[start:start + 16], self_elo[start:start + 16], opponent[start:start + 16])
            logits.append(output[0].cpu().numpy())
            values.append(output[1].cpu().numpy())
    report = {
        "policy": difference(np.concatenate(logits), np.fromfile(args.study / "browser-logits.bin", np.float32)),
        "value": difference(np.concatenate(values), np.fromfile(args.study / "browser-values.bin", np.float32)),
        "gradients": []
    }
    ids = reference["steps"][0]["indices"]
    output = model(inputs[ids], self_elo[ids], opponent[ids])[0]
    logp = output.masked_fill(~torch.tensor(legal[ids], device="cuda"), -1e9).log_softmax(-1)
    targets = torch.tensor(np.asarray(reference["targets"], np.float32)[ids], device="cuda")
    loss = -(logp * targets).sum(-1).mean()
    loss.backward()
    browser = np.fromfile(args.study / "browser-final-gradients.bin", np.float32)
    for item in reference["gradients"]["tensors"]:
        actual = model.w(item["name"]).grad.detach().cpu().numpy()
        expected = browser[item["offset"]:item["offset"] + item["length"]]
        report["gradients"].append({"name": item["name"], **difference(actual, expected)})
    save_json(args.study / "common-state-parity.json", report)
    print(json.dumps({"policy": report["policy"], "value": report["value"],
                      "gradientMaximum": max(row["maximum"] for row in report["gradients"])}), flush=True)
    assert report["policy"]["maximum"] < 0.001
    assert report["value"]["maximum"] < 0.0001
    assert all(row["maximum"] < 0.002 for row in report["gradients"])


if __name__ == "__main__":
    main()
