"""Shared, game-separated real-human sample with full original-Lc0 histories."""

import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path

import chess
import chess.pgn

from native_data import games


def build(archive: Path, limit: int = 1000) -> dict:
    parsed = []
    prefix_hash = hashlib.sha256()
    seen_games = set()
    for text in games(archive, limit):
        prefix_hash.update(text.encode())
        game = chess.pgn.read_game(io.StringIO(text))
        if game is None or game.errors or game.headers.get("Variant", "Standard") != "Standard":
            continue
        moves = list(game.mainline_moves())
        if len(moves) < 40 or game.headers.get("Termination") != "Normal":
            continue
        identity = hashlib.sha256((game.board().fen() + " " + " ".join(move.uci() for move in moves)).encode()).hexdigest()
        if identity in seen_games:
            continue
        seen_games.add(identity)
        parsed.append((game, moves, identity))
    parsed.sort(key=lambda row: (row[0].headers.get("UTCDate", ""), row[0].headers.get("UTCTime", ""), row[2]))
    if len(parsed) < 30:
        raise ValueError("Insufficient independent source games")
    boundaries = [0, int(len(parsed) * .6), int(len(parsed) * .8), len(parsed)]
    result = {"description": "Pooled real human moves, not a single-player personalization or strength test",
              "archive": str(archive.resolve()), "archiveSize": archive.stat().st_size,
              "streamedGames": limit, "streamedPgnSha256": prefix_hash.hexdigest(),
              "sampling": "round robin across games; per-game ply order ranked by SHA256(gameId:ply)",
              "splits": {}, "games": []}
    seen_positions = set()
    for split, start, end, cap in zip(["train", "validation", "test"], boundaries, boundaries[1:], [256, 64, 128]):
        pools = []
        for game, moves, identity in parsed[start:end]:
            board = game.board()
            history, repetitions, counts = [], [], Counter()
            pool = []
            for ply, move in enumerate(moves):
                fen = board.fen(en_passant="fen")
                key = " ".join(board.fen().split()[:4])
                repeated = counts[key] > 0
                counts[key] += 1
                history.insert(0, fen)
                repetitions.insert(0, repeated)
                if ply >= 12 and len(list(board.legal_moves)) >= 2:
                    pool.append({"history": history[:8], "repetitions": repetitions[:8],
                                 "move": move.uci(), "legalMoves": [item.uci() for item in board.legal_moves],
                                 "gameId": identity, "ply": ply})
                board.push(move)
            pool.sort(key=lambda row: hashlib.sha256(f"{identity}:{row['ply']}".encode()).digest())
            pools.append(pool)
            result["games"].append({"id": identity, "split": split, "source": game.headers.get("Site", ""),
                                    "date": game.headers.get("UTCDate", ""), "time": game.headers.get("UTCTime", "")})
        samples = []
        for index in range(max(map(len, pools))):
            for pool in pools:
                if index >= len(pool):
                    continue
                row = pool[index]
                key = row["history"][0].split()[0] + " " + row["history"][0].split()[1]
                if key in seen_positions:
                    continue
                seen_positions.add(key)
                samples.append(row)
                if len(samples) == cap:
                    break
            if len(samples) == cap:
                break
        if len(samples) != cap:
            raise ValueError(f"{split} has only {len(samples)} samples")
        result["splits"][split] = samples
    result["samplesSha256"] = hashlib.sha256(json.dumps(result["splits"], sort_keys=True).encode()).hexdigest()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    dataset = build(args.archive)
    args.output.write_text(json.dumps(dataset, indent=2))
    print(json.dumps({key: len(rows) for key, rows in dataset["splits"].items()}))
