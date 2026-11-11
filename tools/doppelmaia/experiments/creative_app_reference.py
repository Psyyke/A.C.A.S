"""Prepare the frozen later-window candidates for the existing application parity runner."""

import argparse
import csv
import gc
import os
from pathlib import Path
import zipfile

import numpy as np
import torch

from context_models import ShippedContext, history_tokens
from creative_evaluate import digest, load
from unseen_data import save_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("holdout", type=Path)
    parser.add_argument("evaluation", type=Path)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for application parity references")
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    selection_path = args.evaluation / "frozen-selections.json"
    frozen = load(selection_path)
    summary = load(args.evaluation / "fresh-summary.json")
    predictions_path = args.evaluation / "fresh-predictions.csv"
    if digest(args.holdout) != frozen["freshSHA256"] or digest(selection_path) != summary["protocolSHA256"]:
        raise ValueError("The app reference data does not belong to the frozen comparison")
    if digest(predictions_path) != summary["predictionsSHA256"]:
        raise ValueError("The frozen native predictions changed")
    for name, expected in frozen["source"].items():
        if digest(Path(__file__).with_name(name)) != expected:
            raise ValueError("The frozen evaluation implementation changed")
    players = {player["name"]: player for player in load(args.holdout)["players"]}
    selected_rows = {name: [] for name in players}
    with predictions_path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if "strict-new" in row["slices"].split("|"):
                selected_rows[row["player"]].append(row)
    references = []
    for decision in frozen["players"]:
        name = decision["name"]
        samples = players[name]["samples"]
        probes = []
        for color in ("w", "b"):
            choices = [sample for sample in samples if sample["fen"].split()[1] == color and len(sample["history"]) == 8]
            if len(choices) < 2:
                raise ValueError("App checks require full history for both colors")
            probes.extend(choices[index] for index in np.linspace(0, len(choices) - 1, 2, dtype=int))
        checkpoint = decision["selected"]
        checkpoint_path = Path(checkpoint["path"])
        if digest(checkpoint_path) != checkpoint["sha256"]:
            raise ValueError("A frozen candidate model changed")
        model = ShippedContext(checkpoint_path).cuda().eval()
        tokens = torch.tensor(history_tokens(probes)[0], device="cuda")
        outputs = []
        with torch.inference_mode():
            for rating in sorted({max(600, decision["elo"] - 200), decision["elo"], min(2600, decision["elo"] + 200)}):
                ratings = torch.full((len(probes),), rating, dtype=torch.float32, device="cuda")
                policy, value, _ = model(tokens, ratings, ratings)
                outputs.append({"rating": rating, "policy": policy.cpu().flatten().tolist(),
                                "value": value.cpu().flatten().tolist()})
        rows = selected_rows[name]
        cases = [samples[int(row["sample"])] for row in rows]
        if not cases:
            raise ValueError(f"{name} has no strict-new app comparison positions")
        _, _, targets = history_tokens(cases)
        test_cases = []
        for row, sample, target in zip(rows, cases, targets, strict=True):
            prediction = int(row["selectedPrediction"])
            if int(prediction == target) != int(row["selectedMatch"]):
                raise ValueError("The recorded native match and move encoding disagree")
            test_cases.append({"sample": int(row["sample"]), "fen": sample["fen"], "history": sample["history"],
                               "target": int(target), "prediction": prediction, "loss": float(row["selectedLoss"])})
        metrics = summary["players"][name]["strict-new"]
        if len(test_cases) != metrics["positions"]:
            raise ValueError("The app checks must cover every strict-new position")
        references.append({"name": name, "sha256": checkpoint["sha256"], "tokenChannels": 96,
            "modelPath": os.path.relpath(checkpoint_path, args.evaluation),
            "fens": [sample["fen"] for sample in probes], "histories": [sample["history"] for sample in probes],
            "outputs": outputs, "testCases": test_cases, "testElo": decision["elo"],
            "expectedTestAgreement": metrics["selectedAgreement"], "expectedTestCE": metrics["selectedCE"],
            "referenceSourceSHA256": digest(Path(__file__)), "selectionSHA256": digest(selection_path),
            "runtime": {"torch": torch.__version__, "cuda": torch.version.cuda, "gpu": torch.cuda.get_device_name()}})
        print(f"{name} prepared with {len(test_cases)} strict-new app checks", flush=True)
        del model, tokens, policy, value, ratings, targets
        gc.collect()
        torch.cuda.empty_cache()
    if sum(len(reference["testCases"]) for reference in references) != summary["metrics"]["strict-new"]["positions"]:
        raise ValueError("The app checks do not cover the full comparison")
    save_json(args.evaluation / "browser-reference.json", references)
    with zipfile.ZipFile(args.evaluation / "app-check-source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ["creative_app_reference.py", "finetune_browser.mjs"]:
            archive.write(Path(__file__).with_name(name), name)


if __name__ == "__main__":
    main()
