"""Measure whole-game data budgets on development validation, never on test moves."""

import argparse
import gc
import json
from pathlib import Path
import random
import zipfile

from phase_review import digest


def choose_games(samples, budget, seed):
    games = sorted({sample["gameId"] for sample in samples})
    random.Random(seed).shuffle(games)
    if budget != "all":
        count = int(budget)
        if count < 1 or count > len(games):
            raise ValueError("The game budget must fit the available training games")
        games = games[:count]
    chosen = set(games)
    return [sample for sample in samples if sample["gameId"] in chosen], games


def fixed_novel_validation(training, validation):
    import chess
    from native_data import position_key

    seen = {position_key(chess.Board(sample["fen"])) for sample in training}
    games = {sample["gameId"] for sample in training}
    if any(sample["gameId"] in games for sample in validation):
        raise ValueError("Training and validation games overlap")
    result = [sample for sample in validation if position_key(chess.Board(sample["fen"])) not in seen]
    if not result:
        raise ValueError("No validation boards absent from the complete training pool")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", nargs="+", default=["Player07", "Player11", "Player13", "Player14", "Player16", "Player19"])
    parser.add_argument("--budgets", nargs="+", default=["20", "100", "500", "all"])
    args = parser.parse_args()
    import numpy as np
    import torch
    from context_training import ContextTrainable, fit_context
    from finetune_study import MODEL, save_json

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for this development study")
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.manual_seed(42)
    options = {"method": "full", "useHistory": True, "epochs": 6, "learningRate": 1e-5,
               "batchSize": 32, "patience": 2, "baseAnchor": 0.25,
               "weightDecay": 0.01, "clipNorm": 1, "seed": 42}
    files = ["game_budget_study.py", "phase_review.py", "context_training.py", "context_models.py",
             "finetune_model.py", "transformer_workflow.py", "native_data.py", "native_study.py", "finetune_study.py"]
    protocol = {
        "datasetSHA256": digest(args.dataset), "modelSHA256": digest(MODEL),
        "players": args.players, "budgets": args.budgets, "options": options,
        "selection": "Nested whole-game samples with seed 42. Every budget uses validation absent from the complete training pool.",
        "scope": "Development dose response at fixed settings. Not a minimum data guarantee or a fresh test score.",
        "elo": "Fixed per account from training-window ratings",
        "source": {name: digest(Path(__file__).with_name(name)) for name in files},
        "runtime": {"torch": torch.__version__, "cuda": torch.version.cuda, "gpu": torch.cuda.get_device_name()},
    }
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / "protocol.json"
    if path.exists() and json.loads(path.read_text(encoding="utf-8")) != protocol:
        raise ValueError("Use a new output directory for a changed study")
    save_json(path, protocol)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files + ["finetune_LICENSE.txt", "native-requirements.txt"]:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(path, "protocol.json")
    data = json.loads(args.dataset.read_text(encoding="utf-8"))
    players = {player["name"]: player for player in data["players"]}
    results = []
    for name in args.players:
        player = players[name]
        pool = player["splits"]["train"]["samples"]
        validation = fixed_novel_validation(pool, player["splits"]["validation"]["samples"])
        elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
        for budget in args.budgets:
            target = args.output / f"{name}-{budget}.json"
            if target.exists():
                saved = json.loads(target.read_text(encoding="utf-8"))
                if saved["protocolSHA256"] != digest(path):
                    raise ValueError("A resumed result belongs to a different study")
                results.append(saved)
                continue
            training, games = choose_games(pool, budget, options["seed"])
            model = ContextTrainable(MODEL).cuda()
            report = fit_context(model, training, validation, elo, options,
                lambda point: print(json.dumps({"player": name, "budget": budget, **point}), flush=True))
            report.update({"player": name, "budget": budget, "trainingGames": len(games),
                           "selectedGameIds": games, "validationGames": len({sample["gameId"] for sample in validation}),
                           "elo": elo, "protocolSHA256": digest(path)})
            save_json(target, report)
            results.append(report)
            del model
            gc.collect()
            torch.cuda.empty_cache()
    summary = {}
    for budget in args.budgets:
        selected = [row for row in results if row["budget"] == budget]
        count = sum(row["novelValidationPositions"] for row in selected)
        summary[budget] = {
            "accounts": len(selected), "validationPositions": count,
            "trainingGamesRange": [min(row["trainingGames"] for row in selected), max(row["trainingGames"] for row in selected)],
            "trainingPositionsRange": [min(row["trainPositions"] for row in selected), max(row["trainPositions"] for row in selected)],
            "baseAgreement": sum(row["novelValidationPositions"] * row["history"][0]["validationAccuracy"] for row in selected) / count,
            "selectedAgreement": sum(row["novelValidationPositions"] * row["history"][row["bestEpoch"]]["validationAccuracy"] for row in selected) / count,
            "selectedCE": sum(row["novelValidationPositions"] * row["exportedObjectiveLoss"] for row in selected) / count,
            "seconds": sum(row["seconds"] for row in selected),
        }
    save_json(args.output / "summary.json", {"protocol": protocol, "summary": summary})
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
