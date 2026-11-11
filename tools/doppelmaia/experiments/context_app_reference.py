"""Export selected contextual model probes for the actual application worker."""

import argparse
import csv
import gc
import json
import os
from pathlib import Path

import numpy as np
import torch

from context_models import ShippedContext, digest, history_tokens
from finetune_study import save_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for application parity references")
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    frozen = json.loads((args.study / "frozen-selections.json").read_text())
    if digest(args.dataset) != frozen["datasetSHA256"]:
        raise ValueError("Reference data differs from the frozen study")
    for name, expected in frozen["source"].items():
        if digest(Path(__file__).with_name(name)) != expected:
            raise ValueError("The frozen native evaluation implementation changed")
    data = json.loads(args.dataset.read_text())
    report = json.loads((args.study / "study-report.json").read_text())
    if report["selectionSHA256"] != digest(args.study / "frozen-selections.json"):
        raise ValueError("The test report uses different frozen selections")
    if report["predictionsSHA256"] != digest(args.study / "predictions.csv"):
        raise ValueError("The native test predictions changed")
    test_rows = {player["name"]: [] for player in data["players"]}
    with (args.study / "predictions.csv").open(newline="", encoding="utf-8") as stream:
        for row in csv.DictReader(stream):
            if row["method"] == "selected" and row["strictNovel"] == "True":
                test_rows[row["player"]].append(row)
    references = []
    for decision in frozen["players"]:
        player = next(row for row in data["players"] if row["name"] == decision["name"])
        source = player["splits"]["validation"]["samples"]
        rows = []
        for color in ("w", "b"):
            candidates = [row for row in source if row["fen"].split()[1] == color and len(row["history"]) == 8]
            if len(candidates) < 2:
                raise ValueError("App checks require full history for both colors")
            rows.extend(candidates[index] for index in np.linspace(0, len(candidates) - 1, 2, dtype=int))
        checkpoint = decision["context"]
        if digest(checkpoint["path"]) != checkpoint["sha256"]:
            raise ValueError("A selected model changed")
        model = ShippedContext(Path(checkpoint["path"])).cuda().eval()
        tokens = torch.tensor(history_tokens(rows)[0], device="cuda")
        outputs = []
        with torch.inference_mode():
            for rating in sorted({max(600, decision["elo"] - 200), decision["elo"], min(2600, decision["elo"] + 200)}):
                elo = torch.full((len(rows),), rating, dtype=torch.float32, device="cuda")
                policy, value, _ = model(tokens, elo, elo)
                outputs.append({"rating": rating, "policy": policy.cpu().flatten().tolist(),
                                "value": value.cpu().flatten().tolist()})
        test_cases = []
        for row in test_rows[decision["name"]]:
            sample = player["splits"]["test"]["samples"][int(row["sample"])]
            test_cases.append({"sample": int(row["sample"]), "fen": sample["fen"], "history": sample["history"],
                "target": int(row["target"]), "prediction": int(row["predicted"]),
                "loss": float(row["crossEntropy"])})
        metrics = next(row for row in report["players"] if row["name"] == decision["name"])["metrics"]["strictNovel"]["selected"]
        if len(test_cases) != metrics["positions"]:
            raise ValueError("The browser test cases do not cover the complete strict unseen subset")
        references.append({"name": decision["name"], "sha256": checkpoint["sha256"], "tokenChannels": 96,
            "modelPath": os.path.relpath(checkpoint["path"], args.study),
            "fens": [row["fen"] for row in rows], "histories": [row["history"] for row in rows], "outputs": outputs,
            "testCases": test_cases, "testElo": decision["elo"], "expectedTestAgreement": metrics["moveMatch"],
            "expectedTestCE": metrics["crossEntropy"],
            "runtime": {"torch": torch.__version__, "cuda": torch.version.cuda, "gpu": torch.cuda.get_device_name()},
            "referenceSourceSHA256": digest(Path(__file__))})
        del model, tokens, policy, value
        gc.collect()
        torch.cuda.empty_cache()
    save_json(args.study / "browser-reference.json", references)
    print(json.dumps({"selectedModels": len(references), "tokenChannels": 96}), flush=True)


if __name__ == "__main__":
    main()
