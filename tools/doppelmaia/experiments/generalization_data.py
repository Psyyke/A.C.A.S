"""Collect more real player moves and a later, previously unused Lichess holdout."""

import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import re
import statistics
import time

import chess.pgn
import zstandard

def archive_games(path, limit):
    with path.open("rb") as source, zstandard.ZstdDecompressor().stream_reader(source) as stream:
        pending, count = b"", 0
        while chunk := stream.read(8 * 1024 * 1024):
            parts = (pending + chunk).split(b'\n[Event "')
            pending = b'[Event "' + parts.pop() if len(parts) > 1 else parts.pop()
            for index, part in enumerate(parts):
                if index:
                    part = b'[Event "' + part
                count += 1
                yield count, part
                if count >= limit:
                    return
        if pending.strip() and count < limit:
            yield count + 1, pending


def header(raw, name):
    match = re.search(rb'(?m)^\[' + name.encode() + rb' "([^"]*)"\]', raw)
    return match.group(1).decode("utf-8") if match else ""


def prepare_player(task):
    alias, name, records, cutoff, cap, holdout = task
    bot_games = sum(header(raw, "WhiteTitle" if header(raw, "White") == name else "BlackTitle") == "BOT"
                    for _, raw in records)
    if bot_games:
        return {"name": alias, "excluded": "Account has a BOT title in the source PGN",
                "botTitleGames": bot_games, "sourceGames": len(records)}
    unique = {}
    for ordinal, raw in records:
        game = chess.pgn.read_game(io.StringIO(raw.decode("utf-8")))
        if game is None or game.errors:
            raise ValueError(f"{alias} has a malformed source game at archive row {ordinal}")
        if game.headers.get("Variant", "Standard") != "Standard" or game.headers.get("Termination") != "Normal":
            continue
        moves = tuple(move.uci() for move in game.mainline_moves())
        key = (game.board().fen(), moves)
        if key not in unique:
            unique[key] = (ordinal, game, moves)
    records = sorted(unique.values(), key=lambda row: row[0])
    training = [row for row in records if row[0] <= cutoff]
    later = [row for row in records if row[0] > cutoff]
    if len(training) < 100 or len(later) < 80:
        return {"name": alias, "excluded": "Insufficient later activity for the predefined fresh holdout",
                "trainingGames": len(training), "laterGames": len(later)}
    split_games = [training, later[:len(later) // 2], later[len(later) // 2:]]
    result = {"name": alias, "accountType": "No BOT title in collected source games",
              "sourceGames": len(records), "splits": {}, "games": []}
    training_ratings = []
    for split, rows, limit in zip(["train", "validation", "test"], split_games, [cap, holdout, holdout]):
        pools = []
        for game_index, (ordinal, game, moves) in enumerate(rows):
            color = game.headers["White"] == name
            rating = game.headers.get("WhiteElo" if color else "BlackElo", "")
            opponent = game.headers.get("BlackElo" if color else "WhiteElo", "")
            if split == "train" and rating.isdigit():
                training_ratings.append(int(rating))
            game_id = f"{alias}-{ordinal}"
            result["games"].append({"id": game_id, "split": split, "archiveRow": ordinal,
                "date": game.headers.get("UTCDate"), "time": game.headers.get("UTCTime"),
                "source": game.headers.get("Site"), "timeControl": game.headers.get("TimeControl"),
                "playerColor": "white" if color else "black", "playerRating": int(rating) if rating.isdigit() else None,
                "opponentRating": int(opponent) if opponent.isdigit() else None})
            board = game.board()
            history, pool = [], []
            for ply, move in enumerate(game.mainline_moves()):
                history.insert(0, board.fen())
                history = history[:8]
                legal = list(board.legal_moves)
                if board.turn == color and len(legal) >= 2:
                    pool.append({"fen": board.fen(), "move": move.uci(), "gameId": game_id, "gameIndex": game_index,
                        "ply": ply, "color": "w" if color else "b", "legalMoves": [item.uci() for item in legal],
                        "history": list(history), "result": game.headers.get("Result"),
                        "playerRating": int(rating) if rating.isdigit() else None,
                        "opponentRating": int(opponent) if opponent.isdigit() else None})
                board.push(move)
            pools.append(pool)
        # Spread each game's contribution across its whole length before capping.
        quota = max(1, (limit + len(pools) - 1) // len(pools))
        pools = [[pool[round(i * (len(pool) - 1) / max(1, min(len(pool), quota) - 1))]
                  for i in range(min(len(pool), quota))] for pool in pools]
        samples = []
        for index in range(max(map(len, pools), default=0)):
            for pool in pools:
                if index < len(pool):
                    samples.append(pool[index])
                if len(samples) >= limit:
                    break
            if len(samples) >= limit:
                break
        if len(samples) < 500:
            raise ValueError(f"{alias} {split} only has {len(samples)} positions")
        result["splits"][split] = {"samples": samples, "gameIds": sorted({row["gameId"] for row in samples})}
    if not training_ratings:
        raise ValueError(f"{alias} has no training ratings")
    result["medianRating"] = statistics.median(training_ratings)
    result["ratingSource"] = "Training games only"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("previous", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", type=int, default=12)
    parser.add_argument("--games", type=int, default=12000000)
    parser.add_argument("--train-cutoff", type=int, default=6000000)
    parser.add_argument("--train-positions", type=int, default=24000)
    parser.add_argument("--holdout-positions", type=int, default=3000)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--reuse-source", action="store_true")
    args = parser.parse_args()
    prior = json.loads(args.previous.read_text())
    aliases = [player["name"] for player in prior["players"][:args.players]]
    seeds = {}
    for player in prior["players"][:args.players]:
        for game in sorted(player["games"], key=lambda row: (row["date"], row["time"]))[:5]:
            seeds[game["source"]] = (player["name"], game["playerColor"])
    args.output.mkdir(parents=True, exist_ok=True)
    raw_dir = args.output / "source-games"
    raw_dir.mkdir(exist_ok=True)
    index_path = args.output / "source-index.json"
    identity = {"archiveBytes": args.archive.stat().st_size, "archiveModified": args.archive.stat().st_mtime_ns,
                "previousSHA256": hashlib.sha256(args.previous.read_bytes()).hexdigest(),
                "games": args.games, "cutoff": args.train_cutoff, "aliases": aliases}
    names, collected = {}, defaultdict(list)
    started = time.perf_counter()
    if args.reuse_source:
        index = json.loads(index_path.read_text())
        if index["identity"] != identity:
            raise ValueError("Source cache belongs to a different archive or collection protocol")
        names = index["names"]
        for alias in aliases:
            raw = (raw_dir / f"{alias}.pgn").read_bytes()
            if hashlib.sha256(raw).hexdigest() != index["files"][alias]["sha256"]:
                raise ValueError(f"Source cache hash mismatch for {alias}")
            offset = 0
            for ordinal, length in index["files"][alias]["rows"]:
                collected[alias].append((ordinal, raw[offset:offset + length]))
                offset += length
            if offset != len(raw):
                raise ValueError(f"Source cache length mismatch for {alias}")
    else:
        for ordinal, raw in archive_games(args.archive, args.train_cutoff):
            site = header(raw, "Site")
            if site in seeds:
                alias, color = seeds[site]
                if alias not in names:
                    names[alias] = header(raw, color.title())
                    print(f"Identified {alias} at archive row {ordinal}", flush=True)
            if len(names) == len(aliases):
                break
        if len(names) != len(aliases):
            raise ValueError(f"Could not identify prior cohort, found {len(names)} of {len(aliases)}")
        pattern = re.compile(rb'(?m)^\[(?:White|Black) "(' + b"|".join(re.escape(name.encode()) for name in names.values()) + rb')"\]')
        alias_for = {name: alias for alias, name in names.items()}
        for ordinal, raw in archive_games(args.archive, args.games):
            for name in {match.group(1).decode("utf-8") for match in pattern.finditer(raw)}:
                collected[alias_for[name]].append((ordinal, raw))
            if ordinal % 500000 == 0:
                print(json.dumps({"games": ordinal, "seconds": round(time.perf_counter() - started, 1),
                                  "collected": {alias: len(rows) for alias, rows in collected.items()}}), flush=True)
        index = {"identity": identity, "names": names, "files": {}}
        for alias in aliases:
            digest = hashlib.sha256()
            entries = []
            with (raw_dir / f"{alias}.pgn").open("wb") as stream:
                for ordinal, raw in collected[alias]:
                    block = raw.strip() + b"\n\n"
                    stream.write(block)
                    digest.update(block)
                    entries.append([ordinal, len(block)])
            index["files"][alias] = {"sha256": digest.hexdigest(), "rows": entries}
        pending = index_path.with_suffix(".pending.json")
        pending.write_text(json.dumps(index), encoding="utf-8")
        pending.replace(index_path)
    tasks = [(alias, names[alias], collected[alias], args.train_cutoff, args.train_positions, args.holdout_positions)
             for alias in aliases]
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        screening = list(executor.map(prepare_player, tasks))
    players = [player for player in screening if "excluded" not in player]
    excluded = [player for player in screening if "excluded" in player]
    for player in excluded:
        print(json.dumps(player), flush=True)
    if not players:
        raise ValueError("No players met the predefined availability requirements")
    result = {"version": 2, "source": args.archive.name, "sourceUrl": "https://database.lichess.org/",
        "sourceBytes": args.archive.stat().st_size, "priorDatasetSHA256": hashlib.sha256(args.previous.read_bytes()).hexdigest(),
        "scannedGames": args.games, "trainingArchiveCutoff": args.train_cutoff,
        "selection": "First prior activity-selected accounts. Exclude every account with a BOT title, then require at least 100 training and 80 later games. No selection using new model or test scores.",
        "split": "Train uses archive rows through cutoff. Subsequent player games split chronologically in half for validation and sealed test.",
        "sampling": "All game phases spread evenly within each source game, round robin cap. No model-score filtering.",
        "excluded": excluded, "players": players}
    pending = args.output / "human-dataset.pending.json"
    pending.write_text(json.dumps(result), encoding="utf-8")
    pending.replace(args.output / "human-dataset.json")
    print(json.dumps([{"name": p["name"], "games": p["sourceGames"], "rating": p["medianRating"],
                      "counts": {key: len(value["samples"]) for key, value in p["splits"].items()}}
                     for p in players], indent=2), flush=True)


if __name__ == "__main__":
    main()
