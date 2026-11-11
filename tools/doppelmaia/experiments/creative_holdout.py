"""Collect a later fixed archive window without inspecting any model predictions."""

import argparse
from contextlib import ExitStack
import io
import json
from pathlib import Path
import re
import time
import zipfile

import chess.pgn

from generalization_data import archive_games
from unseen_data import digest, save_json


def prepare(alias, account, records, previous_sources, previous_end, cap):
    pools, metadata, sources = [], [], set()
    for ordinal, raw in records:
        game = chess.pgn.read_game(io.StringIO(raw.decode("utf-8")))
        if game is None or game.errors:
            raise ValueError(f"{alias} has a malformed fresh source game")
        side = "White" if game.headers.get("White") == account else "Black"
        if game.headers.get(side) != account or game.headers.get(side + "Title") == "BOT":
            raise ValueError(f"{alias} failed the fresh source account audit")
        if game.headers.get("Variant", "Standard") != "Standard" or game.headers.get("Termination") != "Normal":
            continue
        stamp = [game.headers.get("UTCDate", ""), game.headers.get("UTCTime", "")]
        source = game.headers.get("Site")
        if not all(stamp) or stamp < previous_end or not source or source in previous_sources:
            raise ValueError(f"{alias} has a missing or overlapping fresh source identity")
        if source in sources:
            continue
        sources.add(source)
        game_id = f"{alias}-{ordinal}"
        color = side == "White"
        board, history, pool = game.board(), [], []
        for ply, move in enumerate(game.mainline_moves()):
            history = [board.fen(), *history][:8]
            legal = list(board.legal_moves)
            if board.turn == color and len(legal) >= 2:
                pool.append({"fen": board.fen(), "move": move.uci(), "gameId": game_id, "ply": ply,
                             "color": "w" if color else "b", "legalMoves": [item.uci() for item in legal],
                             "history": list(history)})
            board.push(move)
        if pool:
            pools.append(pool)
            metadata.append({"id": game_id, "archiveRow": ordinal, "source": source, "date": stamp[0], "time": stamp[1]})
    if not pools:
        return {"name": alias, "samples": [], "games": [], "excluded": "No eligible games in the fixed later window"}
    quota = max(1, (cap + len(pools) - 1) // len(pools))
    selected = [[pool[round(index * (len(pool) - 1) / max(1, min(len(pool), quota) - 1))]
                 for index in range(min(len(pool), quota))] for pool in pools]
    samples = [pool[index] for index in range(max(map(len, selected))) for pool in selected if index < len(pool)][:cap]
    return {"name": alias, "samples": samples, "games": metadata}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("previous", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--end", type=int, default=84000000)
    parser.add_argument("--positions", type=int, default=6000)
    parser.add_argument("--reuse-source", action="store_true")
    args = parser.parse_args()
    old_index = json.loads((args.previous / "source-index.json").read_text(encoding="utf-8"))
    old = json.loads((args.previous / "human-dataset.json").read_text(encoding="utf-8"))
    begin = old["protocol"]["testEnd"]
    if args.end <= begin or args.positions < 1:
        raise ValueError("The fixed evaluation window must follow every previously exposed archive row")
    if args.archive.stat().st_size != old["protocol"]["archiveBytes"] or args.archive.stat().st_mtime_ns != old["protocol"]["archiveModified"]:
        raise ValueError("The archive changed since the previous study")
    names = {player["name"]: old_index["names"][player["name"]] for player in old["players"]}
    source_files = ["creative_holdout.py", "generalization_data.py", "unseen_data.py"]
    protocol = {"previousDatasetSHA256": digest(args.previous / "human-dataset.json"),
                "previousIndexSHA256": digest(args.previous / "source-index.json"),
                "archiveBytes": args.archive.stat().st_size, "archiveModified": args.archive.stat().st_mtime_ns,
                "beginExclusive": begin, "endInclusive": args.end, "positionsPerAccount": args.positions,
                "accounts": list(names), "selection": "Same six accounts, fixed later window, no selection using results",
                "source": {name: digest(Path(__file__).with_name(name)) for name in source_files}}
    args.output.mkdir(parents=True, exist_ok=True)
    protocol_path = args.output / "protocol.json"
    if protocol_path.exists() and json.loads(protocol_path.read_text(encoding="utf-8")) != protocol:
        raise ValueError("Use a new directory for changed holdout collection")
    save_json(protocol_path, protocol)
    with zipfile.ZipFile(args.output / "source.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in source_files:
            archive.write(Path(__file__).with_name(name), name)
        archive.write(protocol_path, "protocol.json")
    raw_dir = args.output / "source-games"
    raw_dir.mkdir(exist_ok=True)
    manifest_path = args.output / "source-index.json"
    if args.reuse_source:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest["protocol"] != protocol or manifest["actualScannedGames"] != args.end:
            raise ValueError("Cached fresh source belongs to a different or incomplete window")
    else:
        if manifest_path.exists():
            raise ValueError("Use --reuse-source for an already collected window")
        files = {alias: {"rows": []} for alias in names}
        aliases = {account: alias for alias, account in names.items()}
        pattern = re.compile(rb'(?m)^\[(?:White|Black) "(' + b"|".join(re.escape(name.encode()) for name in names.values()) + rb')"\]')
        actual, started = 0, time.perf_counter()
        with ExitStack() as stack:
            streams = {alias: stack.enter_context((raw_dir / f"{alias}.pgn").open("wb")) for alias in names}
            for actual, raw in archive_games(args.archive, args.end):
                if actual > begin:
                    boundary = raw.find(b"\n\n")
                    matches = pattern.finditer(raw, 0, boundary if boundary >= 0 else len(raw))
                    for account in {match.group(1).decode("utf-8") for match in matches}:
                        alias = aliases[account]
                        streams[alias].write(raw)
                        files[alias]["rows"].append([actual, len(raw)])
                if actual % 6000000 == 0:
                    print(json.dumps({"scannedGames": actual, "seconds": time.perf_counter() - started}), flush=True)
        for alias in names:
            files[alias]["sha256"] = digest(raw_dir / f"{alias}.pgn")
        manifest = {"protocol": protocol, "actualScannedGames": actual, "names": names, "files": files}
        save_json(manifest_path, manifest)
        if actual != args.end:
            raise ValueError(f"The archive ended at {actual}, before the predefined holdout boundary")
    players = []
    previous_sources = {game["source"] for player in old["players"] for game in player["games"]}
    previous_end = max([game["date"], game["time"]] for player in old["players"] for game in player["games"])
    for alias, account in names.items():
        file = raw_dir / f"{alias}.pgn"
        if digest(file) != manifest["files"][alias]["sha256"]:
            raise ValueError("Fresh source file identity changed")
        raw, records, offset = file.read_bytes(), [], 0
        for ordinal, size in manifest["files"][alias]["rows"]:
            if not begin < ordinal <= args.end:
                raise ValueError("Fresh source row crosses the declared window")
            records.append((ordinal, raw[offset:offset + size]))
            offset += size
        if offset != len(raw):
            raise ValueError("Fresh source index size mismatch")
        player = prepare(alias, account, records, previous_sources, previous_end, args.positions)
        players.append(player)
        print(json.dumps({"player": alias, "sourceGames": len(player["games"]), "positions": len(player["samples"])}), flush=True)
    save_json(args.output / "holdout.json", {"protocol": protocol, "sourceIndexSHA256": digest(manifest_path),
                                           "players": players, "previousLastTimestamp": previous_end})


if __name__ == "__main__":
    main()
