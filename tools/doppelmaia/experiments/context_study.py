"""Select regularized context-aware training on development games only."""

import argparse
import gc
import json
from pathlib import Path
import zipfile

import numpy as np
import torch

from context_models import digest
from context_training import ContextTrainable, fit_context
from finetune_study import MODEL, save_json


CONFIGS = [
    {"id": "full-history", "rank": 0, "blocks": 8, "learningRate": 1e-5, "baseAnchor": 0.25},
    {"id": "full-personal-history", "rank": 0, "blocks": 8, "learningRate": 1e-5, "baseAnchor": 0},
    {"id": "top-four-history", "rank": 0, "blocks": 4, "learningRate": 1e-5, "baseAnchor": 0.25},
    {"id": "rank32-history", "rank": 32, "blocks": 8, "learningRate": 1e-4, "directRate": 1e-5, "baseAnchor": 0.25},
    {"id": "rank32-faster-history", "rank": 32, "blocks": 8, "learningRate": 3e-4, "directRate": 1e-5, "baseAnchor": 0.25},
    {"id": "rank64-history", "rank": 64, "blocks": 8, "learningRate": 1e-4, "directRate": 1e-5, "baseAnchor": 0.25},
    {"id": "full-repeated", "rank": 0, "blocks": 8, "history": False, "learningRate": 1e-5, "baseAnchor": 0.25},
    {"id": "full-personal-repeated", "rank": 0, "blocks": 8, "history": False, "learningRate": 1e-5, "baseAnchor": 0},
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", nargs="+", required=True)
    parser.add_argument("--configs", nargs="+", choices=[config["id"] for config in CONFIGS])
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch", type=int, default=32)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required")
    torch.set_num_threads(8)
    torch.manual_seed(42)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    data = json.loads(args.dataset.read_text())
    players = [player for player in data["players"] if player["name"] in args.players]
    if {player["name"] for player in players} != set(args.players):
        raise ValueError("Unknown development player")
    configs = [config for config in CONFIGS if args.configs is None or config["id"] in args.configs]
    files = ["context_models.py", "context_training.py", "context_study.py", "finetune_model.py",
             "transformer_workflow.py", "native_data.py", "native_study.py", "finetune_study.py", "context_test.py"]
    protocol = {"datasetSHA256": digest(args.dataset), "baseSHA256": digest(MODEL),
        "purpose": "Development selection using novel validation only, never test samples",
        "players": args.players, "configs": configs, "epochs": args.epochs, "batch": args.batch,
        "code": {name: digest(Path(__file__).with_name(name)) for name in files}}
    args.output.mkdir(parents=True, exist_ok=True)
    protocol_path = args.output / "protocol.json"
    if protocol_path.exists() and json.loads(protocol_path.read_text()) != protocol:
        raise ValueError("Use a new output directory for changed experiments")
    save_json(protocol_path, protocol)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files + ["finetune_LICENSE.txt", "native-requirements.txt"]:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(protocol_path, "protocol.json")
    summaries = []
    for player in players:
        elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
        directory = args.output / player["name"]
        directory.mkdir(exist_ok=True)
        for configuration in configs:
            name = configuration["id"]
            report_path = directory / f"{name}.json"
            export_path = directory / f"{name}.onnx"
            if report_path.exists():
                report = json.loads(report_path.read_text())
                if digest(export_path) != report["exportSHA256"]:
                    raise ValueError(f"{export_path} changed after training")
            else:
                options = {**configuration, "epochs": args.epochs, "batchSize": args.batch,
                           "patience": 3, "weightDecay": 0.01, "seed": 42}
                model = ContextTrainable(MODEL, rank=configuration["rank"], blocks=configuration["blocks"],
                                         history=configuration.get("history", True)).cuda()
                report = fit_context(model, player["splits"]["train"]["samples"],
                    player["splits"]["validation"]["samples"], elo, options,
                    lambda point: print(json.dumps({"player": player["name"], "candidate": name, **point}), flush=True))
                pending = export_path.with_suffix(".pending.onnx")
                model.export(pending)
                pending.replace(export_path)
                report.update({"player": player["name"], "elo": elo, "id": name,
                               "exportSHA256": digest(export_path)})
                save_json(report_path, report)
                del model
                gc.collect()
                torch.cuda.empty_cache()
            summaries.append({key: report[key] for key in ["player", "id", "bestEpoch", "exportedObjectiveLoss",
                                                          "trainableParameters", "exportedMetrics", "seconds"]})
            save_json(args.output / "development-results.json", {"protocol": protocol, "results": summaries})


if __name__ == "__main__":
    main()
