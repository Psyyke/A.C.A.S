"""Compare stronger starting models on development validation, never test labels."""

import argparse
import csv
import gc
import json
from pathlib import Path
import time

import chess
import numpy as np
import torch
import torch.nn.functional as F

from context_models import RELEASES, SOURCE_COMMIT, ShippedContext, digest, history_tokens, load_release
from finetune_study import MODEL, save_json
from native_data import position_key


@torch.inference_mode()
def measure(model, tokens, legal, labels, elo, batch):
    losses, matches, predicted = [], [], []
    for start in range(0, len(tokens), batch):
        x = torch.tensor(tokens[start:start + batch], device="cuda")
        ratings = torch.full((len(x),), elo, dtype=torch.float32, device="cuda")
        logits = model(x, ratings, ratings)[0]
        mask = torch.tensor(legal[start:start + batch], device="cuda")
        target = torch.tensor(labels[start:start + batch], device="cuda")
        logits = logits.masked_fill(~mask, -1e9)
        if not torch.isfinite(logits).all():
            raise ValueError("Nonfinite contextual predictions")
        chosen = logits.argmax(-1)
        losses.extend(F.cross_entropy(logits, target, reduction="none").cpu().tolist())
        matches.extend((chosen == target).cpu().tolist())
        predicted.extend(chosen.cpu().tolist())
    return {"positions": len(tokens), "loss": float(np.mean(losses)), "accuracy": float(np.mean(matches)),
            "losses": losses, "matches": matches, "predicted": predicted}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("source", type=Path)
    parser.add_argument("weights", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", nargs="+")
    parser.add_argument("--batch", type=int, default=64)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for this model comparison")
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    dataset = json.loads(args.dataset.read_text())
    baseline = json.loads((args.baseline / "validation-selections.json").read_text())
    decisions = {player["name"]: player for player in baseline["players"]}
    selected_players = [player for player in dataset["players"]
                        if args.players is None or player["name"] in args.players]
    if not selected_players or args.players and set(args.players) != {player["name"] for player in selected_players}:
        raise ValueError("Unknown or empty development player selection")
    args.output.mkdir(parents=True, exist_ok=True)
    protocol = {"datasetSHA256": digest(args.dataset), "sourceCommit": SOURCE_COMMIT, "weights": RELEASES,
        "purpose": "Exploratory validation only. No test samples or scores are used.",
        "history": "Oldest to newest, each frame canonicalized for its own side to move, earliest frame padding",
        "players": [player["name"] for player in selected_players], "batch": args.batch,
        "code": {name: digest(Path(__file__).with_name(name)) for name in ["context_models.py", "context_probe.py"]}}
    save_json(args.output / "protocol.json", protocol)
    reports, records = [], []
    started = time.perf_counter()
    for player in selected_players:
        decision = decisions[player["name"]]
        seen = {position_key(chess.Board(row["fen"])) for row in player["splits"]["train"]["samples"]}
        samples = [row for row in player["splits"]["validation"]["samples"]
                   if position_key(chess.Board(row["fen"])) not in seen]
        tokens, legal, labels = history_tokens(samples)
        repeated = np.tile(tokens[:, :, -12:], (1, 1, 8))
        candidate = next(item for item in decision["candidates"] if item["id"] == decision["selected"])
        personal_path = args.baseline / player["name"] / candidate["export"]
        if digest(personal_path) != candidate["exportSHA256"]:
            raise ValueError("The preserved personal baseline changed")
        for name in ["shipped", "personal-baseline", "23m", "79m"]:
            model = (ShippedContext(personal_path if name == "personal-baseline" else MODEL)
                     if name in ["shipped", "personal-baseline"] else load_release(args.source, args.weights, name)).cuda().eval()
            for mode in (["repeat"] if name == "personal-baseline" else ["repeat", "history"]):
                result = measure(model, tokens if mode == "history" else repeated, legal, labels, decision["elo"], args.batch)
                for index, sample in enumerate(samples):
                    records.append({"player": player["name"], "model": name, "context": mode, "gameId": sample["gameId"],
                        "sample": index, "match": int(result["matches"][index]), "loss": result["losses"][index],
                        "predicted": result["predicted"][index]})
                report = {"player": player["name"], "model": name, "context": mode, "elo": decision["elo"],
                          **{key: result[key] for key in ["positions", "loss", "accuracy"]}}
                reports.append(report)
                print(json.dumps(report), flush=True)
            del model
            gc.collect()
            torch.cuda.empty_cache()
        save_json(args.output / "development-results.json", {"protocol": protocol, "results": reports,
                                                          "seconds": time.perf_counter() - started})
    with (args.output / "development-predictions.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)


if __name__ == "__main__":
    main()
