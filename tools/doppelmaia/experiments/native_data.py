"""Prepare chronological human holdouts from a local Lichess database."""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
import io
import json
import math
from pathlib import Path
import re
import statistics

import chess
import chess.pgn
import zstandard


def games(path: Path, limit: int):
    with path.open("rb") as source:
        with zstandard.ZstdDecompressor().stream_reader(source) as stream:
            with io.TextIOWrapper(stream, encoding="utf-8") as text:
                block = []
                count = 0
                for line in text:
                    if line.startswith('[Event "') and block:
                        yield "".join(block)
                        count += 1
                        if count >= limit:
                            return
                        block = []
                    block.append(line)
                if block:
                    yield "".join(block)


def headers(pgn: str) -> dict[str, str]:
    return dict(re.findall(r'^\[(\w+) "([^"]*)"\]', pgn, re.MULTILINE))


def position_key(board: chess.Board) -> str:
    return (board if board.turn else board.mirror()).board_fen()


def parse_player(task: tuple) -> dict:
    name, alias, raw, *settings = task
    config = settings[0] if settings else {}
    parsed = []
    for text in raw:
        game = chess.pgn.read_game(io.StringIO(text))
        if game is None or game.errors:
            raise ValueError(f"Invalid source game for {alias}")
        if game.headers.get("Variant", "Standard") != "Standard":
            continue
        side = "White" if game.headers.get("White") == name else "Black"
        if game.headers.get(side + "Title") == "BOT":
            raise ValueError(f"{alias} is a BOT account, not a human-only study participant")
        parsed.append(game)
    parsed.sort(key=lambda game: (game.headers.get("UTCDate", ""),
                                 game.headers.get("UTCTime", ""), game.headers.get("Site", "")))
    if config.get("includeOpenings"):
        unique = {}
        for game in parsed:
            identity = (game.board().fen(), tuple(move.uci() for move in game.mainline_moves()))
            if identity not in unique:
                unique[identity] = game
        parsed = list(unique.values())
    n = len(parsed)
    boundaries = [int(n * 0.6), int(n * 0.8), n]
    split_names = ["train", "validation", "test"]
    caps = config.get("caps", [2400, 480, 480])
    seen = set()
    result = {"name": alias, "sourceGames": n, "splits": {}, "ratings": [], "games": [], "testOpeningSamples": []}
    begin = 0
    for split, end, cap in zip(split_names, boundaries, caps):
        pools = []
        for game_index in range(begin, end):
            game = parsed[game_index]
            color = game.headers.get("White") == name
            rating = game.headers.get("WhiteElo" if color else "BlackElo", "")
            if split == "train" and rating.isdigit():
                result["ratings"].append(int(rating))
            game_id = f"{alias}-{game_index:04}"
            if not game.headers.get("UTCDate") or not game.headers.get("UTCTime"):
                raise ValueError(f"{game_id} has no timestamp for chronological splitting")
            result["games"].append({
                "id": game_id, "split": split, "date": game.headers["UTCDate"],
                "time": game.headers["UTCTime"], "source": game.headers.get("Site", ""),
                "playerColor": "white" if color else "black",
                "playerRating": int(rating) if rating.isdigit() else None
            })
            board = game.board()
            pool = []
            for ply, move in enumerate(game.mainline_moves()):
                if ply >= (0 if config.get("includeOpenings") else 12) and board.turn == color and len(list(board.legal_moves)) >= 2:
                    sample = {"fen": board.fen(), "move": move.uci(), "gameId": game_id,
                              "ply": ply, "legalMoves": [item.uci() for item in board.legal_moves]}
                    pool.append(sample)
                    if config.get("includeOpenings") and split == "test" and ply < 24:
                        result["testOpeningSamples"].append(sample)
                board.push(move)
            pools.append(pool)
        samples = []
        if config.get("includeOpenings"):
            quota = max(1, math.ceil(cap / max(1, len(pools))))
            def spread(pool):
                if len(pool) <= quota:
                    return pool
                opening = [row for row in pool if row["ply"] < 24]
                later = [row for row in pool if row["ply"] >= 24]
                early_count = min(len(opening), max(1, round(quota * 0.3)))
                late_count = min(len(later), quota - early_count)
                early_count = min(len(opening), quota - late_count)
                def pick(rows, count):
                    if not count:
                        return []
                    return [rows[round(i * (len(rows) - 1) / max(1, count - 1))] for i in range(count)]
                return sorted(pick(opening, early_count) + pick(later, late_count), key=lambda row: row["ply"])
            pools = [spread(pool) for pool in pools]
        # Round robin prevents one long game from consuming a split's budget.
        for ply_index in range(max(map(len, pools), default=0)):
            for pool in pools:
                if ply_index >= len(pool):
                    continue
                sample = pool[ply_index]
                key = position_key(chess.Board(sample["fen"]))
                if config.get("includeOpenings") or key not in seen:
                    seen.add(key)
                    samples.append(sample)
                if len(samples) >= cap:
                    break
            if len(samples) >= cap:
                break
        if len(samples) < 120:
            raise ValueError(f"{alias} {split} has only {len(samples)} independent positions")
        result["splits"][split] = {"samples": samples,
                                  "gameIds": sorted({row["gameId"] for row in samples})}
        begin = end
    if not result["ratings"]:
        raise ValueError(f"{alias} has no training ratings")
    result["medianRating"] = statistics.median(result.pop("ratings"))
    result["ratingSource"] = "Training games only"
    result["accountType"] = "No BOT title in collected source games"
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--games", type=int, default=900000)
    parser.add_argument("--players", type=int, default=5)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--include-openings", action="store_true")
    parser.add_argument("--train-positions", type=int, default=2400)
    parser.add_argument("--holdout-positions", type=int, default=480)
    args = parser.parse_args()
    counts = Counter()
    rating_sum = Counter()
    bots = set()
    for index, text in enumerate(games(args.archive, args.games), 1):
        tags = headers(text)
        if tags.get("Variant", "Standard") != "Standard" or tags.get("Termination") != "Normal":
            continue
        for color in ["White", "Black"]:
            rating, name = tags.get(color + "Elo", ""), tags.get(color, "")
            if tags.get(color + "Title") == "BOT":
                bots.add(name)
                continue
            if name and rating.isdigit() and 1000 <= int(rating) <= 1800:
                counts[name] += 1
                rating_sum[name] += int(rating)
        if index % 50000 == 0:
            print(f"Counted {index} games", flush=True)
    selected = [name for name, count in counts.most_common()
                if name not in bots and count >= 60 and rating_sum[name] / count <= 1750][:args.players]
    if len(selected) != args.players:
        raise ValueError(f"Need {args.players} prolific players, found {len(selected)} in {args.games} games")
    collected = defaultdict(list)
    for text in games(args.archive, args.games):
        tags = headers(text)
        if tags.get("Termination") != "Normal":
            continue
        for name in selected:
            if name in [tags.get("White"), tags.get("Black")]:
                collected[name].append(text)
    config = {"includeOpenings": args.include_openings,
              "caps": [args.train_positions, args.holdout_positions, args.holdout_positions]}
    tasks = [(name, f"Player{index + 1:02}", collected[name], config) for index, name in enumerate(selected)]
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        players = list(executor.map(parse_player, tasks))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        "source": args.archive.name, "sourceUrl": "https://database.lichess.org/",
        "scannedGames": args.games,
        "selection": f"{args.players} most frequent non-BOT 1000 to 1800 rated accounts, mean at most 1750, at least 60 games. No selection using model results.",
        "split": "Chronological 60 percent training, 20 validation, 20 sealed test",
        "positions": ("Openings included and repeated positions kept, duplicate complete games removed. Per game quotas cover opening and later moves with about 30 percent opening positions. Familiar and novel test inputs must be reported separately."
                      if args.include_openings else "Skip 12 plies, exact canonical input deduplication across splits"),
        "config": config,
        "players": players
    }), encoding="utf-8")
    print(json.dumps([{key: value for key, value in player.items() if key not in ["splits", "games", "testOpeningSamples"]}
                      for player in players], indent=2))


if __name__ == "__main__":
    main()
