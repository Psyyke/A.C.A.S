"""Freeze validation decisions, then evaluate the untouched global archive window."""

import argparse
from collections import defaultdict
import csv
import gc
import io
import json
from pathlib import Path
import time
import zipfile

import chess
import chess.pgn
import numpy as np

from generalization_data import header
from native_data import position_key
from unseen_data import digest, read_records, save_json, same_collection


def audit_dataset(data, directory):
    if data["version"] != 4:
        raise ValueError("The fixed-window version 4 dataset is required")
    index = json.loads((directory / "source-index.json").read_text())
    if digest(directory / "source-index.json") != data["sourceIndexSHA256"]:
        raise ValueError("The source index changed after preparation")
    if not same_collection(index["protocol"], data["protocol"]):
        raise ValueError("Collection and preparation windows differ")
    protocol = data["protocol"]
    if index["actualScannedGames"] != protocol["testEnd"]:
        raise ValueError("The declared test window was not completely scanned")
    shared, results = {}, []
    for player in data["players"]:
        alias = player["name"]
        games = {game["id"]: game for game in player["games"]}
        by_row = {game["archiveRow"]: game for game in player["games"]}
        requests, intervals, owned = defaultdict(dict), {}, set()
        for split, part in player["splits"].items():
            stamps = []
            for game in player["games"]:
                if game["split"] != split:
                    continue
                row = game["archiveRow"]
                expected = "train" if row <= protocol["trainEnd"] else "validation" if row <= protocol["validationEnd"] else "test"
                if split != expected or row > protocol["testEnd"]:
                    raise ValueError(f"{alias} crosses a global source boundary")
                if not game["date"] or not game["time"] or not game["source"] or game["source"] in owned:
                    raise ValueError(f"{alias} has missing timestamps or duplicated source games")
                owned.add(game["source"])
                if shared.setdefault(game["source"], split) != split:
                    raise ValueError("The same source game crosses splits between accounts")
                stamps.append((game["date"], game["time"]))
            intervals[split] = [list(min(stamps)), list(max(stamps))]
            for sample in part["samples"]:
                game = games[sample["gameId"]]
                if game["split"] != split or sample["ply"] in requests[game["archiveRow"]]:
                    raise ValueError(f"{alias} has a duplicated or misplaced sample")
                requests[game["archiveRow"]][sample["ply"]] = sample
        if not intervals["train"][1] <= intervals["validation"][0] <= intervals["validation"][1] <= intervals["test"][0]:
            raise ValueError(f"{alias} source timestamps do not follow the declared temporal order")
        ratings = [game["playerRating"] for game in player["games"]
                   if game["split"] == "train" and game["playerRating"] is not None]
        if float(np.median(ratings)) != player["medianRating"]:
            raise ValueError("A conditioning rating was not derived from training games")
        checked = 0
        account = index["names"][alias]
        for ordinal, raw in read_records(directory, index, alias):
            side = "White" if header(raw, "White") == account else "Black"
            if header(raw, side) != account or header(raw, side + "Title") == "BOT":
                raise ValueError(f"{alias} failed the source account audit")
            if ordinal not in requests:
                continue
            game = chess.pgn.read_game(io.StringIO(raw.decode("utf-8")))
            if game is None or game.errors or game.headers.get("Site") != by_row[ordinal]["source"]:
                raise ValueError(f"{alias} has invalid source provenance")
            rating = game.headers.get(side + "Elo", "")
            rating = int(rating) if rating.isdigit() else None
            metadata = {"date": game.headers.get("UTCDate"), "time": game.headers.get("UTCTime"),
                        "playerColor": side.lower(), "playerRating": rating}
            if game.headers.get(side) != account or any(by_row[ordinal].get(key) != value for key, value in metadata.items()):
                raise ValueError(f"{alias} has incorrect source metadata")
            board, history = game.board(), []
            for ply, move in enumerate(game.mainline_moves()):
                history = [board.fen(), *history][:8]
                sample = requests[ordinal].get(ply)
                if sample is not None:
                    if board.turn != (side == "White") or sample.get("color") != ("w" if side == "White" else "b"):
                        raise ValueError(f"{alias} has a target from the other account's turn")
                    if sample.get("playerRating") != rating:
                        raise ValueError(f"{alias} has incorrect sample source metadata")
                    if sample["history"] != history or sample["fen"] != board.fen() or sample["move"] != move.uci():
                        raise ValueError(f"{alias} contains a noncausal or incorrect source example")
                    if set(sample["legalMoves"]) != {item.uci() for item in board.legal_moves}:
                        raise ValueError(f"{alias} contains an incomplete legal move list")
                    checked += 1
                board.push(move)
        if checked != sum(len(part["samples"]) for part in player["splits"].values()):
            raise ValueError(f"{alias} has source examples that could not be verified")
        results.append({"name": alias, "sourceSHA256": index["files"][alias]["sha256"], "botTitleGames": 0,
                        "checkedPositions": checked, "utcIntervals": intervals})
        print(json.dumps({"audited": alias, "positions": checked}), flush=True)
    return {"accounts": results, "uniqueSourceGames": len(shared), "excluded": data["excluded"],
            "identityLimit": "No BOT titles in the source files, not independently verified human identities"}


def audited(args, data):
    files = ["context_evaluation.py", "unseen_data.py", "generalization_data.py", "native_data.py"]
    identity = {"datasetSHA256": digest(args.dataset), "sourceIndexSHA256": digest(args.dataset.parent / "source-index.json"),
                "chess": chess.__version__, "code": {name: digest(Path(__file__).with_name(name)) for name in files}}
    path = args.output / "source-audit.json"
    if path.exists():
        saved = json.loads(path.read_text())
        if saved["identity"] != identity:
            raise ValueError("The completed source audit has different inputs or code")
        for account in saved["audit"]["accounts"]:
            if digest(args.dataset.parent / "source-games" / f'{account["name"]}.pgn') != account["sourceSHA256"]:
                raise ValueError("An audited source game file changed")
        return saved["audit"]
    audit = audit_dataset(data, args.dataset.parent)
    save_json(path, {"identity": identity, "audit": audit})
    return audit


def previous_board_keys(path, expected_hash):
    if path is None or digest(path) != expected_hash:
        raise ValueError("The previous development dataset must match its recorded identity")
    previous = json.loads(path.read_text())
    return {player["name"]: {position_key(chess.Board(sample["fen"]))
            for split in player["splits"].values() for sample in split["samples"]}
            for player in previous["players"]}


def freeze(args, data):
    training = json.loads((args.training / "protocol.json").read_text())
    if training["datasetSHA256"] != digest(args.dataset):
        raise ValueError("Models were trained on a different dataset")
    previous_protocol = json.loads((args.previous / "protocol.json").read_text())
    previous_hash = data["protocol"]["prefixDatasetSHA256"]
    if previous_protocol["datasetSHA256"] != previous_hash:
        raise ValueError("The previous models do not use the declared development dataset")
    previous_boards = previous_board_keys(args.previous_dataset, previous_hash)
    previous = json.loads((args.previous / "validation-selections.json").read_text())
    prior = {row["name"]: row for row in previous["players"]}
    decisions = []
    for player in data["players"]:
        name = player["name"]
        candidate_groups = {}
        for group, ids in [("context", args.history_candidates), ("repeated", args.repeated_candidates)]:
            candidates = []
            for candidate_id in ids:
                report_path = args.training / name / f"{candidate_id}.json"
                report = json.loads(report_path.read_text())
                path = args.training / name / f"{candidate_id}.onnx"
                if digest(path) != report["exportSHA256"] or report["player"] != name:
                    raise ValueError("A completed development model changed")
                if report["options"].get("history", True) != (group == "context"):
                    raise ValueError("A candidate has the wrong board-history protocol")
                candidates.append({"id": candidate_id, "path": str(path.resolve()),
                    "sha256": report["exportSHA256"], "validationCE": report["exportedObjectiveLoss"],
                    "bestEpoch": report["bestEpoch"], "elo": report["elo"], "reportSHA256": digest(report_path)})
            candidate_groups[group] = min(candidates, key=lambda row: (row["validationCE"], row["id"]))
            candidate_groups[group + "Candidates"] = candidates
        old = next(row for row in prior[name]["candidates"] if row["id"] == prior[name]["selected"])
        old_path = args.previous / name / old["export"]
        if digest(old_path) != old["exportSHA256"]:
            raise ValueError("The preserved previous personalized model changed")
        decisions.append({"name": name, "elo": candidate_groups["context"]["elo"], **candidate_groups,
            "previous": {"id": old["id"], "path": str(old_path.resolve()), "sha256": old["exportSHA256"],
                         "trainingElo": prior[name]["elo"]}})
    audit = audited(args, data)
    files = ["context_evaluation.py", "context_models.py", "context_probe.py", "unseen_data.py",
             "generalization_data.py", "finetune_model.py", "native_data.py", "native_study.py", "finetune_study.py"]
    result = {"datasetSHA256": digest(args.dataset), "trainingProtocolSHA256": digest(args.training / "protocol.json"),
        "previousDatasetSHA256": previous_hash, "previousDatasetPath": str(args.previous_dataset.resolve()),
        "previousBoardCounts": {player["name"]: len(previous_boards[player["name"]]) for player in data["players"]},
        "selection": "Minimum current-board-novel validation CE including epoch zero. Test scores are never used.",
        "strictNovel": "Current canonical board absent from this account's new training and validation and all prior development splits",
        "primaryComparison": "Same strictly unseen test moves for every method, with paired original-source-game intervals",
        "baseSHA256": training["baseSHA256"], "players": decisions, "audit": audit, "windows": data["protocol"],
        "historyCandidates": args.history_candidates, "repeatedCandidates": args.repeated_candidates,
        "source": {name: digest(Path(__file__).with_name(name)) for name in files}}
    path = args.output / "frozen-selections.json"
    if path.exists() and json.loads(path.read_text()) != result:
        raise ValueError("Use a new evaluation directory for changed frozen selections")
    save_json(path, result)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files + ["finetune_LICENSE.txt", "native-requirements.txt"]:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(path, "frozen-selections.json")


def aggregate(records, paired_interval):
    result = {}
    methods = sorted({row["method"] for row in records})
    for subset in ["all", "strictNovel", "opening", "later", "familiar"]:
        groups = {}
        for method in methods:
            rows = [row for row in records if row["method"] == method and (subset == "all" or row[subset])]
            if not rows:
                continue
            accounts = {row["player"] for row in rows}
            groups[method] = {"positions": len(rows), "accounts": len(accounts),
                "moveMatch": float(np.mean([row["match"] for row in rows])),
                "crossEntropy": float(np.mean([row["crossEntropy"] for row in rows])),
                "equalAccountMoveMatch": float(np.mean([
                    np.mean([row["match"] for row in rows if row["player"] == account]) for account in accounts]))}
            if subset == "strictNovel":
                groups[method]["paired"] = {}
                for reference in ["base", "previous-personal", "matched-repeated"]:
                    baseline = {(row["player"], row["sample"]): row for row in records if row["method"] == reference}
                    delta = np.array([row["match"] - baseline[(row["player"], row["sample"])]["match"] for row in rows])
                    groups[method]["paired"][reference] = paired_interval(rows, delta)
        result[subset] = groups
    return result


def evaluate(args, data):
    import torch
    from context_models import ShippedContext, history_tokens
    from context_probe import measure
    from finetune_study import MODEL
    from native_study import paired_interval
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the frozen test evaluation")
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    protocol_path = args.output / "frozen-selections.json"
    frozen = json.loads(protocol_path.read_text())
    if frozen["datasetSHA256"] != digest(args.dataset) or frozen["baseSHA256"] != digest(MODEL):
        raise ValueError("Evaluation inputs changed after selection")
    for name, expected in frozen["source"].items():
        if digest(Path(__file__).with_name(name)) != expected:
            raise ValueError("Evaluation source changed after selection")
    previous_boards = previous_board_keys(Path(frozen["previousDatasetPath"]), frozen["previousDatasetSHA256"])
    records, players, started = [], [], time.perf_counter()
    decisions = frozen["players"]
    for player in data["players"]:
        decision = next(row for row in decisions if row["name"] == player["name"])
        wrong = decisions[(decisions.index(decision) + 1) % len(decisions)]["context"]
        training = player["splits"]["train"]["samples"]
        validation = player["splits"]["validation"]["samples"]
        samples = player["splits"]["test"]["samples"]
        seen = {position_key(chess.Board(row["fen"])) for row in training}
        seen_all = seen | {position_key(chess.Board(row["fen"])) for row in validation} | previous_boards[player["name"]]
        keys = [position_key(chess.Board(row["fen"])) for row in samples]
        sources = {game["id"]: game["source"] for game in player["games"]}
        tokens, legal, targets = history_tokens(samples)
        repeated = np.tile(tokens[:, :, -12:], (1, 1, 8))
        elo = decision["elo"]
        base = {"path": str(MODEL), "sha256": frozen["baseSHA256"]}
        methods = [
            ("base", base, repeated, elo), ("context-base", base, tokens, elo),
            ("previous-personal", decision["previous"], repeated, elo),
            ("matched-repeated", decision["repeated"], repeated, elo),
            ("selected", decision["context"], tokens, elo),
            ("selected-plus200", decision["context"], tokens, min(2600, elo + 200)),
            ("wrong-person", wrong, tokens, elo)]
        for method, checkpoint, inputs, rating in methods:
            if digest(checkpoint["path"]) != checkpoint["sha256"]:
                raise ValueError("A frozen evaluation model changed")
            model = ShippedContext(Path(checkpoint["path"])).cuda().eval()
            measured = measure(model, inputs, legal, targets, rating, 64)
            for index, sample in enumerate(samples):
                records.append({"player": player["name"], "method": method, "sample": index,
                    "gameId": sources[sample["gameId"]], "ply": sample["ply"], "elo": rating,
                    "strictNovel": keys[index] not in seen_all, "familiar": keys[index] in seen,
                    "opening": sample["ply"] < 24, "later": sample["ply"] >= 24,
                    "match": int(measured["matches"][index]), "crossEntropy": measured["losses"][index],
                    "predicted": measured["predicted"][index], "target": int(targets[index])})
            del model
            gc.collect()
            torch.cuda.empty_cache()
        personal = [row for row in records if row["player"] == player["name"]]
        report = {"name": player["name"], "elo": elo, "selection": decision,
                  "counts": {key: len(part["samples"]) for key, part in player["splits"].items()},
                  "metrics": aggregate(personal, paired_interval)}
        players.append(report)
        save_json(args.output / f'{player["name"]}.json', report)
        print(json.dumps({"player": player["name"], "strictNovel": report["metrics"]["strictNovel"]}), flush=True)
    with (args.output / "predictions.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    report = {"protocol": frozen, "selectionSHA256": digest(protocol_path), "players": players,
              "aggregate": aggregate(records, paired_interval), "seconds": time.perf_counter() - started,
              "predictionsSHA256": digest(args.output / "predictions.csv")}
    save_json(args.output / "study-report.json", report)
    print(json.dumps(report["aggregate"]["strictNovel"]), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("training", type=Path)
    parser.add_argument("previous", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--stage", choices=["audit", "freeze", "evaluate"], required=True)
    parser.add_argument("--previous-dataset", type=Path, help="Required when freezing. All earlier splits are excluded from strict novelty.")
    parser.add_argument("--history-candidates", nargs="+", default=["full-history", "full-personal-history"])
    parser.add_argument("--repeated-candidates", nargs="+", default=["full-repeated", "full-personal-repeated"])
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    data = json.loads(args.dataset.read_text())
    {"audit": audited, "freeze": freeze, "evaluate": evaluate}[args.stage](args, data)


if __name__ == "__main__":
    main()
