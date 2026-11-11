"""Reproduce the history-aware browser epoch and checkpoint workflow on CUDA."""

import argparse
import json
from pathlib import Path
import zipfile

import numpy as np
import torch

from context_models import digest
from context_training import ContextTrainable, fit_context
from finetune_study import MODEL, save_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--player", default="Player14")
    parser.add_argument("--train", type=int, default=10241)
    parser.add_argument("--validation", type=int, default=512)
    parser.add_argument("--epochs", type=int, default=6)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the contextual browser reference")
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.manual_seed(42)
    data = json.loads(args.dataset.read_text())
    player = next(player for player in data["players"] if player["name"] == args.player)
    if min(args.train, args.validation, args.epochs) < 1:
        raise ValueError("Positive training, validation and epoch counts are required")
    def pick(rows, count):
        return [rows[index] for index in np.linspace(0, len(rows) - 1, min(len(rows), count), dtype=int)]
    training = pick(player["splits"]["train"]["samples"], args.train)
    validation = pick(player["splits"]["validation"]["samples"], args.validation)
    elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
    options = {"method": "full", "useHistory": True, "epochs": args.epochs, "learningRate": 1e-5,
               "batchSize": 16, "patience": 2, "baseAnchor": 0.25, "weightDecay": 0.01,
               "clipNorm": 1, "seed": 42}
    files = ["context_workflow.py", "context_training.py", "context_models.py", "finetune_model.py",
             "transformer_workflow.py", "native_data.py", "native_study.py", "finetune_study.py"]
    protocol = {"datasetSHA256": digest(args.dataset), "modelSHA256": digest(MODEL), "player": args.player,
        "train": len(training), "validation": len(validation), "options": options,
        "source": {name: digest(Path(__file__).with_name(name)) for name in files}}
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / "protocol.json"
    if path.exists() and json.loads(path.read_text()) != protocol:
        raise ValueError("Use a new output directory for a changed workflow reference")
    save_json(path, protocol)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files + ["finetune_LICENSE.txt", "native-requirements.txt"]:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(path, "protocol.json")
    save_json(args.output / "workflow.json", {"provider": "webgpu", "elo": elo, "goal": "imitate",
        "options": options, "dataset": {"player": args.player,
        "train": {"samples": training}, "validation": {"samples": validation}}})
    model = ContextTrainable(MODEL).cuda()
    report = fit_context(model, training, validation, elo, options,
                         lambda point: print(json.dumps(point), flush=True))
    report.update({"protocol": protocol, "device": torch.cuda.get_device_name(), "tokenChannels": 96})
    model.export(args.output / "cuda.onnx")
    report["exportSHA256"] = digest(args.output / "cuda.onnx")
    save_json(args.output / "cuda-report.json", report)
    print(json.dumps({"selected": report["bestEpoch"], "seconds": report["seconds"]}), flush=True)


if __name__ == "__main__":
    main()
