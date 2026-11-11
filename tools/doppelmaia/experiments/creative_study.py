# SPDX-License-Identifier: AGPL-3.0-only
"""Screen simple contextual training ideas on fixed development boards only."""

import argparse
import gc
import json
from pathlib import Path
import time
import zipfile

import numpy as np
import torch
import torch.nn.functional as F

from context_models import ShippedContext, digest, history_tokens
from context_training import ContextTrainable
from creative_targets import METHODS, target_recipe
from finetune_study import MODEL, save_json
from game_budget_study import fixed_novel_validation
from transformer_workflow import capture_step, epoch_order


@torch.no_grad()
def logits_for(model, x, masks, ratings, ids, batch):
    parts = []
    for start in range(0, len(ids), batch):
        rows = ids[start:start + batch]
        logits = model(x[rows], ratings[rows], ratings[rows])[0].masked_fill(~masks[rows], -1e9)
        if not torch.isfinite(logits).all():
            raise ValueError("Nonfinite creative study logits")
        parts.append(logits)
    return torch.cat(parts)


def fit(model, training, labels, teacher, x, masks, ratings, options, method, notify, peer_state=None):
    batch = options["batchSize"]
    if len(training) < batch or len(x) <= len(training):
        raise ValueError("A full training batch and separate validation examples are required")
    train_ids = np.arange(len(training))
    valid_ids = np.arange(len(training), len(x))
    recipe = target_recipe(training, labels[:len(training)].cpu().tolist(), method)
    anchors = torch.tensor([row["anchor"] for row in recipe], device="cuda").reshape(-1, 1)
    weights = torch.tensor([row["weight"] for row in recipe], device="cuda").reshape(-1, 1)
    targets = anchors * teacher
    for index, row in enumerate(recipe):
        for move, probability in row["distribution"].items():
            targets[index, move] += (1 - row["anchor"]) * probability
    if method == "surprise":
        weights = (-teacher.gather(1, labels[:len(training), None]).clamp_min(1e-8).log()).clamp(0.25, 4).sqrt()
        weights /= weights.mean()
    targets *= weights
    if not torch.isfinite(targets).all() or targets.masked_select(~masks[:len(training)]).abs().max() != 0:
        raise ValueError("Invalid training targets")
    if peer_state is not None:
        model.load_state_dict(peer_state)

    @torch.no_grad()
    def measure(ids):
        logits = logits_for(model, x, masks, ratings, ids, batch)
        return {"loss": float(F.cross_entropy(logits, labels[ids])),
                "accuracy": float((logits.argmax(-1) == labels[ids]).float().mean())}

    parameters = [parameter for parameter in model.parameters() if parameter.requires_grad]
    optimizer = torch.optim.AdamW(parameters, lr=options["learningRate"], weight_decay=0.01,
                                  foreach=False, capturable=True)
    replay = capture_step(model, optimizer, x, masks, targets, ratings, batch, 1)
    history, snapshots = [], []
    best_loss, best_epoch, stale, updates = float("inf"), 0, 0, 0
    best = None
    started = time.perf_counter()
    for epoch in range(options["epochs"] + 1):
        if epoch:
            order = epoch_order(len(training), epoch, options["seed"])
            for start in range(0, len(order), batch):
                ids = torch.tensor(order[start:start + batch], device="cuda")
                if len(ids) == batch:
                    loss, norm = replay(ids)
                else:
                    optimizer.zero_grad(set_to_none=False)
                    logits = model(x[ids], ratings[ids], ratings[ids])[0].masked_fill(~masks[ids], -1e9)
                    loss = -(targets[ids] * logits.log_softmax(-1)).sum(-1).mean()
                    loss.backward()
                    norm = torch.nn.utils.clip_grad_norm_(parameters, 1)
                    optimizer.step()
                if not torch.isfinite(loss) or not torch.isfinite(norm):
                    raise ValueError("Nonfinite creative study update")
                updates += 1
        train, valid = measure(train_ids), measure(valid_ids)
        point = {"epoch": epoch, "trainLoss": train["loss"], "trainAccuracy": train["accuracy"],
                 "validationLoss": valid["loss"], "validationAccuracy": valid["accuracy"]}
        history.append(point)
        notify(point)
        snapshot = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        if method == "baseline" and epoch:
            snapshots.append((valid["loss"], epoch, snapshot))
            snapshots.sort(key=lambda entry: (entry[0], entry[1]))
            snapshots = snapshots[:3]
        if valid["loss"] < best_loss - 1e-5:
            best_loss, best_epoch, stale, best = valid["loss"], epoch, 0, snapshot
        else:
            stale += 1
        if stale >= options["patience"]:
            break
    if best is None:
        raise AssertionError("The initial model was not checkpointed")
    model.load_state_dict(best)
    selected = measure(valid_ids)
    return {"method": method, "options": options, "history": history, "bestEpoch": best_epoch,
            "validation": selected, "updates": updates, "seconds": time.perf_counter() - started,
            "trainingPositions": len(training), "validationPositions": len(valid_ids)}, snapshots


def peer_prior(name, initial, donors):
    paths = [path for account, path in donors.items() if account != name]
    if not paths:
        raise ValueError("The peer prior needs other accounts, never the target account")
    state = {key: 0.75 * tensor for key, tensor in initial.items()}
    for path in paths:
        donor = ShippedContext(path)
        for key, tensor in donor.state_dict().items():
            state[key] += 0.25 * tensor.detach() / len(paths)
        del donor
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("donors", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", nargs="+", default=["Player07", "Player14", "Player16"])
    parser.add_argument("--methods", nargs="+", choices=METHODS, default=METHODS)
    parser.add_argument("--positions", type=int, default=10240)
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--patience", type=int, default=2)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the creative study")
    torch.set_num_threads(8)
    torch.manual_seed(42)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    options = {"batchSize": 32, "learningRate": 1e-5, "epochs": args.epochs, "patience": args.patience, "seed": 42}
    if args.positions < 32 or args.epochs < 1 or args.patience < 1:
        raise ValueError("Positive settings and at least one full training batch are required")
    data = json.loads(args.dataset.read_text(encoding="utf-8"))
    players = {player["name"]: player for player in data["players"]}
    if not set(args.players) <= players.keys() or len(set(args.players)) != len(args.players):
        raise ValueError("Unknown or duplicate development accounts")
    donors = {name: args.donors / name / "full-history.onnx" for name in players}
    files = ["creative_study.py", "creative_targets.py", "context_training.py", "context_models.py",
             "phase_review.py", "game_budget_study.py", "finetune_model.py", "transformer_workflow.py",
             "native_data.py", "native_study.py", "finetune_study.py"]
    protocol = {"datasetSHA256": digest(args.dataset), "baseSHA256": digest(MODEL),
                "players": args.players, "methods": args.methods, "positionLimit": args.positions, "options": options,
                "donors": {name: {"path": str(path.resolve()), "sha256": digest(path)} for name, path in donors.items()},
                "selection": "Fixed validation boards absent from the complete training pool. No test samples are evaluated.",
                "sampling": "Deterministic evenly spaced training positions. Identical examples across methods.",
                "prior": "75 percent base plus 25 percent mean of other accounts' full-history models. Not Maia4All reproduction.",
                "source": {name: digest(Path(__file__).with_name(name)) for name in files}}
    args.output.mkdir(parents=True, exist_ok=True)
    protocol_path = args.output / "protocol.json"
    if protocol_path.exists() and json.loads(protocol_path.read_text(encoding="utf-8")) != protocol:
        raise ValueError("Use a new output directory for changed research")
    save_json(protocol_path, protocol)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files + ["finetune_LICENSE.txt", "native-requirements.txt"]:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(protocol_path, "protocol.json")
    results = []
    for name in args.players:
        player = players[name]
        pool = player["splits"]["train"]["samples"]
        training = [pool[index] for index in np.linspace(0, len(pool) - 1, min(args.positions, len(pool)), dtype=int)]
        validation = fixed_novel_validation(pool, player["splits"]["validation"]["samples"])
        tokens, legal, targets = history_tokens(training + validation)
        x, masks, labels = torch.tensor(tokens, device="cuda"), torch.tensor(legal, device="cuda"), torch.tensor(targets, device="cuda")
        del tokens, legal, targets
        elo = int(np.clip(round(player["medianRating"] / 100) * 100, 600, 2600))
        ratings = torch.full((len(x),), elo, dtype=torch.float32, device="cuda")
        model = ContextTrainable(MODEL).cuda()
        initial = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        teacher = logits_for(model, x, masks, ratings, np.arange(len(training)), 32).softmax(-1)
        directory = args.output / name
        directory.mkdir(exist_ok=True)
        for method in args.methods:
            report_path, export_path = directory / f"{method}.json", directory / f"{method}.onnx"
            if report_path.exists():
                report = json.loads(report_path.read_text(encoding="utf-8"))
                if report["protocolSHA256"] != digest(protocol_path) or digest(export_path) != report["exportSHA256"]:
                    raise ValueError("A completed creative result changed")
                results.append(report)
                continue
            model.load_state_dict(initial)
            prior = peer_prior(name, initial, donors) if method == "peer-prior" else None
            report, snapshots = fit(model, training, labels, teacher, x, masks, ratings, options, method,
                lambda point: print(json.dumps({"player": name, "method": method, **point}), flush=True), prior)
            before = {"allocated": torch.cuda.memory_allocated(), "reserved": torch.cuda.memory_reserved()}
            model.zero_grad(set_to_none=True)
            gc.collect()
            torch.cuda.empty_cache()
            after = {"allocated": torch.cuda.memory_allocated(), "reserved": torch.cuda.memory_reserved()}
            report["exportMemory"] = {"beforeCleanup": before, "afterCleanup": after}
            print(json.dumps({"player": name, "method": method, "exportMemory": report["exportMemory"]}), flush=True)
            model.export(export_path)
            report.update({"player": name, "elo": elo, "protocolSHA256": digest(protocol_path), "exportSHA256": digest(export_path)})
            if method == "baseline":
                soup_results = []
                selected_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
                candidates = [("base-shrink", [(0.75, selected_state), (0.25, initial)])]
                for count in [2, 3]:
                    if len(snapshots) >= count:
                        candidates.append((f"checkpoint-mean-{count}", [(1 / count, state) for _, _, state in snapshots[:count]]))
                for label, components in candidates:
                    state = {key: sum(weight * part[key] for weight, part in components) for key in initial}
                    model.load_state_dict(state)
                    valid_logits = logits_for(model, x, masks, ratings, np.arange(len(training), len(x)), 32)
                    score = {"loss": float(F.cross_entropy(valid_logits, labels[len(training):])),
                             "accuracy": float((valid_logits.argmax(-1) == labels[len(training):]).float().mean())}
                    candidate = {"id": label, **score}
                    if score["loss"] < report["validation"]["loss"]:
                        path = directory / f"{label}.onnx"
                        model.export(path)
                        candidate["exportSHA256"] = digest(path)
                    soup_results.append(candidate)
                save_json(directory / "averages.json", {"protocolSHA256": digest(protocol_path), "results": soup_results})
                del selected_state, candidates, components, state, valid_logits
            save_json(report_path, report)
            results.append(report)
            save_json(args.output / "results.json", {"protocol": protocol, "results": results})
            del snapshots, prior
            gc.collect()
            torch.cuda.empty_cache()
        del model, teacher, x, masks, labels, ratings, initial
        gc.collect()
        torch.cuda.empty_cache()
    save_json(args.output / "results.json", {"protocol": protocol, "results": results})


if __name__ == "__main__":
    main()
