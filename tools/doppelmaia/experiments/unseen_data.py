"""Extend the audited cohort with globally separated, previously unused games."""

import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from contextlib import ExitStack
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import time

from generalization_data import archive_games, prepare_player


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def save_json(path, value):
    pending = path.with_suffix(".pending.json")
    with pending.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, separators=(",", ":"), allow_nan=False)
    pending.replace(path)


def same_collection(left, right):
    keys = set(left) | set(right)
    return all(left.get(key) == right.get(key) for key in keys - {"codeSHA256", "parserSHA256"})


def read_records(directory, manifest, alias):
    source = directory / "source-games" / f"{alias}.pgn"
    if digest(source) != manifest["files"][alias]["sha256"]:
        raise ValueError(f"Cached source identity changed for {alias}")
    raw = source.read_bytes()
    result, offset = [], 0
    for ordinal, length in manifest["files"][alias]["rows"]:
        result.append((ordinal, raw[offset:offset + length]))
        offset += length
    if offset != len(raw):
        raise ValueError(f"Cached source index length mismatch for {alias}")
    return result


def prepare_fixed(task):
    alias, name, records, train_end, validation_end, train_cap, holdout_cap = task
    player = prepare_player((alias, name, records, train_end, sys.maxsize, sys.maxsize))
    if "excluded" in player:
        return player
    pools = defaultdict(list)
    for split in player["splits"].values():
        for sample in split["samples"]:
            pools[sample["gameId"]].append(sample)
    partitions = {"train": [], "validation": [], "test": []}
    for game in player["games"]:
        ordinal = game["archiveRow"]
        game["split"] = "train" if ordinal <= train_end else "validation" if ordinal <= validation_end else "test"
        partitions[game["split"]].append(game["id"])
    player["splits"] = {}
    for split, game_ids in partitions.items():
        cap = train_cap if split == "train" else holdout_cap
        if not game_ids:
            return {"name": alias, "excluded": f"No games in the predefined {split} window"}
        quota = max(1, (cap + len(game_ids) - 1) // len(game_ids))
        groups = []
        for index, game_id in enumerate(game_ids):
            rows = sorted(pools[game_id], key=lambda row: row["ply"])
            count = min(len(rows), quota)
            chosen = [rows[round(i * (len(rows) - 1) / max(1, count - 1))] for i in range(count)]
            for sample in chosen:
                sample["gameIndex"] = index
            groups.append(chosen)
        samples = []
        for index in range(max(map(len, groups), default=0)):
            for group in groups:
                if index < len(group) and len(samples) < cap:
                    samples.append(group[index])
        if len(samples) < 500:
            return {"name": alias, "excluded": f"Fewer than 500 positions in the predefined {split} window"}
        player["splits"][split] = {"samples": samples, "gameIds": sorted({row["gameId"] for row in samples})}
    return player


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("prefix", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--train-end", type=int, default=48000000)
    parser.add_argument("--validation-end", type=int, default=60000000)
    parser.add_argument("--games", type=int, default=72000000)
    parser.add_argument("--train-cap", type=int, default=60000)
    parser.add_argument("--holdout-cap", type=int, default=6000)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--reuse-source", action="store_true")
    args = parser.parse_args()
    if args.train_cap < 500 or args.holdout_cap < 500 or args.workers < 1:
        raise ValueError("Both position budgets must be at least 500 and workers must be positive")
    previous_path = args.prefix / "human-dataset.json"
    previous = json.loads(previous_path.read_text())
    prefix_index = json.loads((args.prefix / "source-index.json").read_text())
    prefix_end = previous["scannedGames"]
    if not prefix_end < args.train_end < args.validation_end < args.games:
        raise ValueError("Both new evaluation windows must follow the entire exposed source window")
    archive_identity = {"archiveBytes": args.archive.stat().st_size,
                        "archiveModified": args.archive.stat().st_mtime_ns}
    if any(prefix_index["identity"][key] != value for key, value in archive_identity.items()):
        raise ValueError("The archive changed since the audited prefix was collected")
    aliases = [player["name"] for player in previous["players"]]
    names = {alias: prefix_index["names"][alias] for alias in aliases}
    protocol = {**archive_identity, "prefixDatasetSHA256": digest(previous_path),
        "prefixIndexSHA256": digest(args.prefix / "source-index.json"), "prefixEnd": prefix_end,
        "trainEnd": args.train_end, "validationEnd": args.validation_end, "testEnd": args.games,
        "trainCap": args.train_cap, "holdoutCap": args.holdout_cap, "aliases": aliases,
        "selection": "The eight previously audited accounts. No replacement using new performance.",
        "split": "Global archive cutoffs shared across accounts. All new test games follow the validation cutoff.",
        "codeSHA256": digest(Path(__file__)),
        "parserSHA256": digest(Path(__file__).with_name("generalization_data.py"))}
    args.output.mkdir(parents=True, exist_ok=True)
    protocol_path = args.output / "collection-protocol.json"
    if protocol_path.exists() and not same_collection(json.loads(protocol_path.read_text()), protocol):
        raise ValueError("Use a new output directory for a changed collection protocol")
    if not protocol_path.exists():
        save_json(protocol_path, protocol)
    raw_dir = args.output / "source-games"
    raw_dir.mkdir(exist_ok=True)
    index_path = args.output / "source-index.json"
    if args.reuse_source:
        manifest = json.loads(index_path.read_text())
        if not same_collection(manifest["protocol"], protocol) or manifest["actualScannedGames"] != args.games:
            raise ValueError("Cached source has a different collection protocol")
    else:
        if index_path.exists():
            raise ValueError("A completed source cache already exists. Use --reuse-source.")
        files = {}
        for alias in aliases:
            read_records(args.prefix, prefix_index, alias)
            shutil.copyfile(args.prefix / "source-games" / f"{alias}.pgn", raw_dir / f"{alias}.pgn")
            files[alias] = {"rows": [list(row) for row in prefix_index["files"][alias]["rows"]]}
        pattern = re.compile(rb'(?m)^\[(?:White|Black) "('
                             + b"|".join(re.escape(name.encode()) for name in names.values()) + rb')"\]')
        alias_for = {name: alias for alias, name in names.items()}
        started, actual = time.perf_counter(), 0
        with ExitStack() as stack:
            streams = {alias: stack.enter_context((raw_dir / f"{alias}.pgn").open("ab")) for alias in aliases}
            for actual, raw in archive_games(args.archive, args.games):
                if actual > prefix_end:
                    end = raw.find(b"\n\n")
                    matches = pattern.finditer(raw, 0, end if end >= 0 else len(raw))
                    for name in {match.group(1).decode("utf-8") for match in matches}:
                        alias = alias_for[name]
                        block = raw.strip() + b"\n\n"
                        streams[alias].write(block)
                        files[alias]["rows"].append([actual, len(block)])
                if actual % 2000000 == 0:
                    print(json.dumps({"games": actual, "seconds": round(time.perf_counter() - started, 1),
                                      "collected": {alias: len(value["rows"]) for alias, value in files.items()}}), flush=True)
        if actual != args.games:
            raise ValueError(f"Archive ended at {actual} games before the declared {args.games} cutoff")
        for alias, value in files.items():
            value["sha256"] = digest(raw_dir / f"{alias}.pgn")
        manifest = {"protocol": protocol, "names": names, "files": files, "actualScannedGames": actual}
        save_json(index_path, manifest)
    tasks = [(alias, names[alias], read_records(args.output, manifest, alias), args.train_end,
              args.validation_end, args.train_cap, args.holdout_cap) for alias in aliases]
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        screening = list(executor.map(prepare_fixed, tasks))
    result = {"version": 4, "source": args.archive.name, "protocol": protocol,
              "sourceIndexSHA256": digest(index_path),
              "excluded": [player for player in screening if "excluded" in player],
              "players": [player for player in screening if "excluded" not in player]}
    if not result["players"]:
        raise ValueError("No account has sufficient activity in the fixed windows")
    save_json(args.output / "human-dataset.json", result)
    print(json.dumps({"excluded": result["excluded"], "players": [
        {"name": player["name"], "counts": {key: len(split["samples"]) for key, split in player["splits"].items()}}
        for player in result["players"]]}), flush=True)


if __name__ == "__main__":
    main()
