"""CPU-only tests for source provenance and paired contextual study aggregation."""

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

import chess
import chess.pgn

from context_evaluation import aggregate, audit_dataset, previous_board_keys
from native_data import position_key
from unseen_data import digest


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="acas-context-audit-")
        self.directory = Path(self.temporary.name)
        (self.directory / "source-games").mkdir()
        protocol = {"trainEnd": 2, "validationEnd": 4, "testEnd": 6}
        player = {"name": "Player01", "medianRating": 1500, "games": [], "splits": {}}
        blocks, indices = [], []
        for i, (split, sans) in enumerate(zip(["train", "validation", "test"], ["e4 e5", "d4 d5", "Nf3 d5"])):
            game, board = chess.pgn.Game(), chess.Board()
            game.headers.update({"White": "FixtureA", "Black": "FixtureB", "WhiteElo": "1500",
                                 "Site": f"https://example.invalid/game{i}", "UTCDate": f"2026.01.0{i + 1}",
                                 "UTCTime": "12:00:00"})
            node = game
            for san in sans.split():
                move = board.parse_san(san)
                node = node.add_main_variation(move)
                board.push(move)
            raw = (str(game) + "\n\n").encode()
            ordinal, game_id = 2 * i + 1, f"Player01-{2 * i + 1}"
            blocks.append(raw)
            indices.append([ordinal, len(raw)])
            board = chess.Board()
            sample = {"gameId": game_id, "ply": 0, "fen": board.fen(), "history": [board.fen()],
                      "color": "w", "playerRating": 1500,
                      "move": board.parse_san(sans.split()[0]).uci(),
                      "legalMoves": [move.uci() for move in board.legal_moves]}
            player["games"].append({"id": game_id, "archiveRow": ordinal, "split": split,
                "source": game.headers["Site"], "date": game.headers["UTCDate"],
                "time": game.headers["UTCTime"], "playerRating": 1500, "playerColor": "white"})
            player["splits"][split] = {"gameIds": [game_id], "samples": [sample]}
        source = self.directory / "source-games" / "Player01.pgn"
        source.write_bytes(b"".join(blocks))
        index = {"protocol": protocol, "actualScannedGames": 6, "names": {"Player01": "FixtureA"},
                 "files": {"Player01": {"sha256": digest(source), "rows": indices}}}
        (self.directory / "source-index.json").write_text(json.dumps(index))
        self.data = {"version": 4, "protocol": protocol, "players": [player], "excluded": [],
                     "sourceIndexSHA256": digest(self.directory / "source-index.json")}

    def tearDown(self):
        self.temporary.cleanup()

    def test_exact_causal_sources_are_audited_without_loading_cuda(self):
        self.assertNotIn("torch", sys.modules)
        result = audit_dataset(self.data, self.directory)
        self.assertEqual(result["accounts"][0]["checkedPositions"], 3)
        self.assertEqual(result["uniqueSourceGames"], 3)
        self.assertNotIn("torch", sys.modules)

    def test_future_history_and_incomplete_masks_fail(self):
        for field, value in [("history", [chess.Board().fen(), chess.Board().fen()]), ("legalMoves", ["e2e4"])]:
            data = copy.deepcopy(self.data)
            data["players"][0]["splits"]["test"]["samples"][0][field] = value
            with self.assertRaises(ValueError):
                audit_dataset(data, self.directory)

    def test_source_and_global_boundary_changes_fail(self):
        data = copy.deepcopy(self.data)
        data["players"][0]["games"][2]["archiveRow"] = 2
        with self.assertRaisesRegex(ValueError, "global source boundary"):
            audit_dataset(data, self.directory)
        source = self.directory / "source-games" / "Player01.pgn"
        with source.open("ab") as stream:
            stream.write(b"\n")
        with self.assertRaisesRegex(ValueError, "identity changed"):
            audit_dataset(self.data, self.directory)

    def test_rating_and_timestamp_leakage_fail(self):
        for field, value in [("medianRating", 1700), ("games", [
            {**game, "date": "2025.01.01"} if game["split"] == "test" else game
            for game in self.data["players"][0]["games"]])]:
            data = copy.deepcopy(self.data)
            data["players"][0][field] = value
            with self.assertRaises(ValueError):
                audit_dataset(data, self.directory)

    def test_correct_source_moves_from_the_opponent_are_rejected(self):
        data = copy.deepcopy(self.data)
        board = chess.Board()
        board.push_uci("e2e4")
        sample = data["players"][0]["splits"]["train"]["samples"][0]
        sample.update({"ply": 1, "fen": board.fen(), "history": [board.fen(), chess.Board().fen()],
                       "move": "e7e5", "color": "b",
                       "legalMoves": [move.uci() for move in board.legal_moves]})
        with self.assertRaisesRegex(ValueError, "account's turn"):
            audit_dataset(data, self.directory)

    def test_self_consistent_but_incorrect_source_metadata_is_rejected(self):
        data = copy.deepcopy(self.data)
        data["players"][0]["games"][0]["playerRating"] = 1600
        data["players"][0]["medianRating"] = 1600
        with self.assertRaisesRegex(ValueError, "source metadata"):
            audit_dataset(data, self.directory)
        data = copy.deepcopy(self.data)
        for game in data["players"][0]["games"]:
            game["date"] = game["date"].replace("2026.01", "2026.02")
        with self.assertRaisesRegex(ValueError, "source metadata"):
            audit_dataset(data, self.directory)

    def test_aggregation_pairs_rows_and_preserves_shared_source_game_clusters(self):
        rows = []
        for method in ["base", "previous-personal", "matched-repeated", "selected"]:
            for player, index, source, match in [
                ("A", 0, "source1", 1), ("A", 1, "source1", 1),
                ("A", 2, "source2", 0), ("B", 0, "source1", 1)]:
                rows.append({"player": player, "method": method, "sample": index, "gameId": source,
                    "strictNovel": True, "opening": False, "later": True, "familiar": False,
                    "match": match if method == "selected" else 0, "crossEntropy": 1})
        def intervals(samples, difference):
            return {"mean": float(difference.mean()), "games": len({row["gameId"] for row in samples})}
        result = aggregate(rows, intervals)["strictNovel"]["selected"]
        self.assertEqual(result["positions"], 4)
        self.assertEqual(result["moveMatch"], 0.75)
        self.assertAlmostEqual(result["equalAccountMoveMatch"], 5 / 6)
        self.assertEqual(result["paired"]["base"], {"mean": 0.75, "games": 2})

    def test_strict_novelty_excludes_every_prior_development_split(self):
        previous = copy.deepcopy(self.data)
        expected = set()
        for split, move in zip(["train", "validation", "test"], ["e2e4", "d2d4", "g1f3"]):
            board = chess.Board()
            board.push_uci(move)
            previous["players"][0]["splits"][split]["samples"][0]["fen"] = board.fen()
            expected.add(position_key(board))
        path = self.directory / "previous.json"
        path.write_text(json.dumps(previous))
        self.assertEqual(previous_board_keys(path, digest(path))["Player01"], expected)
        self.assertEqual(len(expected), 3)
        with self.assertRaisesRegex(ValueError, "recorded identity"):
            previous_board_keys(path, "changed")
        self.assertNotIn("torch", sys.modules)


if __name__ == "__main__":
    unittest.main()
