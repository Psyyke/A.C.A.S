"""Reconstruct one existing anonymized player's full-history, chronological holdouts."""

import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import re
import statistics
import time

import chess
import chess.pgn

from native_data import games


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, default=Path(r"temp\doppelmaia-imitation-study-v2\human-dataset.json"))
    parser.add_argument("--archive", type=Path, default=Path(r"temp\lichess-databases\lichess_db_standard_rated_2026-10.pgn.zst"))
    parser.add_argument("--output", type=Path, default=Path(r"temp\doppelmaia-original-person\dataset.json"))
    parser.add_argument("--player", default="Player01")
    args = parser.parse_args()
    metadata = json.loads(args.metadata.read_text())
    player = next(row for row in metadata["players"] if row["name"] == args.player)
    desired = {row["source"].rstrip("/").split("/")[-1]: row for row in player["games"]}
    pools = {split: [] for split in ["train", "validation", "test"]}
    collected, hashes, game_records = set(), [], []
    started = time.perf_counter()
    scanned = 0
    for scanned, text in enumerate(games(args.archive, metadata["scannedGames"]), 1):
        match = re.search(r'^\[Site "([^"]+)"\]', text, re.MULTILINE)
        key = match.group(1).rstrip("/").split("/")[-1] if match else ""
        if key in desired and key not in collected:
            record = desired[key]
            game = chess.pgn.read_game(io.StringIO(text))
            if game is None or game.errors:
                raise ValueError(f"Invalid source PGN {key}")
            collected.add(key)
            moves = list(game.mainline_moves())
            identity = hashlib.sha256((game.board().fen() + " " + " ".join(move.uci() for move in moves)).encode()).hexdigest()
            board = game.board()
            counts, history, repetitions, rows = Counter(), [], [], []
            player_color = record["playerColor"] == "white"
            for ply, move in enumerate(moves):
                fen = board.fen(en_passant="fen")
                position = " ".join(board.fen().split()[:4])
                repetitions.insert(0, int(counts[position] > 0))
                counts[position] += 1
                history.insert(0, fen)
                if ply >= 12 and board.turn == player_color and len(list(board.legal_moves)) >= 2:
                    rows.append({"history": history[:8], "repetitions": repetitions[:8], "gameId": identity,
                                 "move": move.uci(), "legalMoves": [item.uci() for item in board.legal_moves], "ply": ply})
                board.push(move)
            rows.sort(key=lambda row: hashlib.sha256(f"{identity}:{row['ply']}".encode()).digest())
            pools[record["split"]].append((record["date"], record["time"], identity, rows))
            game_records.append({**record, "id": identity})
            hashes.append(hashlib.sha256(text.encode()).hexdigest())
        if scanned % 100000 == 0:
            print(json.dumps({"scannedGames": scanned, "matchedGames": len(collected),
                              "seconds": time.perf_counter() - started}), flush=True)
        if len(collected) == len(desired):
            break
    if len(collected) != len(desired):
        raise ValueError(f"Only reconstructed {len(collected)}/{len(desired)} source games")
    splits, seen = {}, set()
    for split, cap in [("train", 1024), ("validation", 256), ("test", 512)]:
        ordered = [row[3] for row in sorted(pools[split])]
        samples = []
        for ply_index in range(max(map(len, ordered))):
            for pool in ordered:
                if ply_index >= len(pool):
                    continue
                row = pool[ply_index]
                position = " ".join(row["history"][0].split()[:2])
                if position in seen:
                    continue
                seen.add(position)
                samples.append(row)
                if len(samples) == cap:
                    break
            if len(samples) == cap:
                break
        if len(samples) != cap:
            raise ValueError(f"Only {len(samples)}/{cap} {split} samples")
        splits[split] = samples
    result = {"description": "Single anonymized real player, chronological 60/20/20 source-game holdouts",
              "player": args.player, "medianRating": statistics.median(row["playerRating"] for row in game_records),
              "sourceGames": len(game_records), "archive": str(args.archive.resolve()),
              "archiveSize": args.archive.stat().st_size, "scannedGames": scanned,
              "matchedPgnSha256": hashlib.sha256("".join(sorted(hashes)).encode()).hexdigest(),
              "metadataSha256": hashlib.sha256(args.metadata.read_bytes()).hexdigest(),
              "splits": splits, "games": game_records,
              "samplesSha256": hashlib.sha256(json.dumps(splits, sort_keys=True).encode()).hexdigest(),
              "preparationSeconds": time.perf_counter() - started}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps({key: value for key, value in result.items() if key not in ["splits", "games"]}))


if __name__ == "__main__":
    main()
