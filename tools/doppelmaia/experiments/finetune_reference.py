"""Write native CUDA outputs for the real app worker/browser regression."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from finetune_model import Maia3
from finetune_study import MODEL, predict, save_json
from native_study import encode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("study", type=Path)
    parser.add_argument("--generalization", action="store_true",
                        help="Check the audited study's validation-selected ONNX exports")
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the native application reference")
    torch.set_num_threads(4)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    source = json.loads(args.dataset.read_text())
    report_name = "generalization-report.json" if args.generalization else "finetune-report.json"
    report = json.loads((args.study / report_name).read_text())
    if args.generalization and hashlib.sha256(args.dataset.read_bytes()).hexdigest() != report["protocol"]["datasetSHA256"]:
        raise ValueError("Reference dataset differs from the executed study")
    result = []
    for player in report["players"]:
        samples = next(p for p in source["players"] if p["name"] == player["name"])["splits"]["test"]["samples"]
        samples = [samples[i] for i in np.linspace(0, len(samples) - 1, 8, dtype=int)]
        tokens = encode(samples)[0]
        if args.generalization:
            selected = next(c for c in player["selection"]["candidates"] if c["id"] == player["selected"])
            filename, sha256, elo = selected["export"], selected["exportSHA256"], player["elo"]
            path = args.study / player["name"] / filename
            if hashlib.sha256(path.read_bytes()).hexdigest() != sha256:
                raise ValueError("Selected ONNX changed after evaluation")
            model = Maia3(path).cuda()
        else:
            selected = next(c for c in player["candidates"] if c["id"] == player["selected"])
            filename, sha256, elo = "maia3-finetuned.onnx", player["exportSHA256"], player["rating"]
            model = Maia3(MODEL).cuda()
            model.load_state_dict(torch.load(selected["checkpoint"], map_location="cuda", weights_only=True))
        outputs = []
        for rating in sorted({1000, elo, 2200}):
            policy, value, _ = predict(model, tokens, rating, batch=8)
            outputs.append({"rating": rating, "policy": policy.ravel().tolist(), "value": value.ravel().tolist()})
        result.append({"name": player["name"], "filename": filename, "sha256": sha256,
                       "fens": [s["fen"] for s in samples], "outputs": outputs})
        del model
    save_json(args.study / "browser-reference.json", result)


if __name__ == "__main__":
    main()
