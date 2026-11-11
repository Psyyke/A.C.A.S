"""Small independent checks for native study encodings and evaluation."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import unittest

import chess
import chess.pgn
import numpy as np

from native_data import parse_player, position_key
from native_study import MOVES, canonical_move, encode, metrics, paired_interval, probabilities


class NativeStudyTests(unittest.TestCase):
    def test_incomplete_or_duplicated_legal_masks_are_rejected(self) -> None:
        board = chess.Board()
        moves = [move.uci() for move in board.legal_moves]
        for malformed in [moves[1:], moves + [moves[0]]]:
            with self.subTest(moves=malformed), self.assertRaisesRegex(ValueError, "Invalid native study move encoding"):
                encode([{"fen": board.fen(), "move": "e2e4", "legalMoves": malformed, "gameId": "one"}])

    def test_bot_accounts_are_not_human_training_examples(self) -> None:
        for side in ["White", "Black"]:
            raw = f'[White "A"]\n[Black "B"]\n[{side}Title "BOT"]\n\n1. e4 e5 *\n'
            account = "A" if side == "White" else "B"
            with self.subTest(side=side), self.assertRaisesRegex(ValueError, "BOT account"):
                parse_player((account, "Player", [raw]))

    def test_tokens_are_mover_relative_and_match_browser_piece_order(self) -> None:
        board = chess.Board()
        board.push_uci("e2e4")
        moves = [move.uci() for move in board.legal_moves]
        sample = {"fen": board.fen(), "move": "e7e5", "legalMoves": moves, "gameId": "one"}
        tokens, legal, targets = encode([sample])
        self.assertEqual(tokens.shape, (1, 64, 12))
        self.assertEqual(tokens.sum(), 32)
        self.assertEqual(tokens[0, chess.E2, 0], 1)
        self.assertEqual(tokens[0, chess.E5, 6], 1)
        self.assertEqual(targets[0], MOVES["e2e4"])
        self.assertEqual(legal.sum(), len(moves))
        self.assertEqual(canonical_move("a2a1n", True), "a7a8n")
        self.assertEqual(position_key(board), position_key(board.mirror()))

    def test_legal_mask_and_extreme_logits_have_finite_metrics(self) -> None:
        board = chess.Board()
        sample = {"fen": board.fen(), "move": "e2e4",
                  "legalMoves": [move.uci() for move in board.legal_moves], "gameId": "one"}
        _, legal, targets = encode([sample])
        base = np.full((1, 4352), 10000, np.float32)
        base[0, legal[0]] = -10000
        distribution = probabilities(np.zeros((1, 64), np.float32), base, legal,
                                     np.zeros((64, 4352), np.float32), np.zeros(4352, np.float32))
        self.assertTrue(np.isfinite(distribution).all())
        self.assertAlmostEqual(float(distribution.sum()), 1)
        self.assertEqual(float(distribution[~legal].sum()), 0)
        summary, rows = metrics([sample], distribution, targets)
        self.assertAlmostEqual(summary["crossEntropy"], np.log(20), places=5)
        self.assertIn(chess.Move.from_uci(rows[0]["chosen"]), board.legal_moves)
        self.assertAlmostEqual(summary["predictedTraits"]["knight"], 0.2, places=6)

    def test_intervals_resample_games_not_independent_positions(self) -> None:
        samples = [{"gameId": "one"}] * 8 + [{"gameId": "two"}] * 2
        differences = np.array([1.0] * 8 + [-1.0] * 2)
        interval = paired_interval(samples, differences)
        self.assertEqual(interval, paired_interval(samples, differences))
        self.assertEqual(interval["games"], 2)
        self.assertAlmostEqual(interval["mean"], 0.6)
        self.assertEqual(interval["low"], -1)
        self.assertEqual(interval["high"], 1)


class NativeOutputTests(unittest.TestCase):
    study = None

    def setUp(self) -> None:
        if self.study is None:
            self.skipTest("Pass --study to check generated research outputs")

    def test_source_hash_splits_and_negative_controls(self) -> None:
        report = json.loads((self.study / "native-report.json").read_text())
        raw = (self.study / "human-dataset.json").read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), report["humanDatasetSHA256"])
        for player in json.loads(raw)["players"]:
            seen, games = set(), set()
            chronology = [(game["date"], game["time"], game["source"]) for game in player["games"]]
            self.assertEqual(chronology, sorted(chronology))
            self.assertEqual(len(chronology), player["sourceGames"])
            metadata = {game["id"]: game for game in player["games"]}
            for name in ["train", "validation", "test"]:
                split = player["splits"][name]
                self.assertFalse(games.intersection(split["gameIds"]))
                games.update(split["gameIds"])
                self.assertTrue(all(metadata[game_id]["split"] == name for game_id in split["gameIds"]))
                for sample in split["samples"]:
                    key = position_key(chess.Board(sample["fen"]))
                    self.assertNotIn(key, seen)
                    seen.add(key)
        for player in report["players"]:
            self.assertEqual(player["training"]["randomLabelControl"]["bestEpoch"], 0)
        for export in report["exports"].values():
            self.assertEqual(export["bytes"], 92296726)
            self.assertLess(export["maximumLogitError"], 0.001)
        self.assertGreater(report["onnxKernelExecutions"]["CUDAExecutionProvider"], 0)

    def test_prediction_csv_reproduces_reported_loss(self) -> None:
        report = json.loads((self.study / "native-report.json").read_text())
        groups = {}
        with (self.study / "test-predictions.csv").open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                groups.setdefault((row["player"], row["model"]), []).append(row)
        for player in report["players"]:
            for model, metrics in player["test"].items():
                rows = groups[(player["name"], model)]
                self.assertEqual(len(rows), metrics["positions"])
                self.assertAlmostEqual(np.mean([float(row["crossEntropy"]) for row in rows]),
                                       metrics["crossEntropy"], places=10)
                quality = [row for row in rows if row["expectedCpLoss"]]
                self.assertEqual(len(quality), metrics["quality"]["positions"])
                self.assertAlmostEqual(np.mean([float(row["expectedCpLoss"]) for row in quality]),
                                       metrics["quality"]["expectedCpLoss"], places=10)

    def test_autonomous_games_are_legal_paired_and_one_move_per_ply(self) -> None:
        report = json.loads((self.study / "rollout-report.json").read_text())
        groups = {}
        with (self.study / "rollout-moves.csv").open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                groups.setdefault((row["model"], int(row["game"])), []).append(row)
        openings = {}
        for model, metrics in report["models"].items():
            source = io.StringIO((self.study / f"rollout-{model}.pgn").read_text())
            games = []
            while (game := chess.pgn.read_game(source)) is not None:
                self.assertFalse(game.errors)
                games.append(game)
            self.assertEqual(len(games), report["protocol"]["gamesPerModel"])
            for index, game in enumerate(games):
                rows = groups[(model, index)]
                self.assertEqual([int(row["ply"]) for row in rows], list(range(len(rows))))
                first = rows[0]["fen"]
                if index in openings:
                    self.assertEqual(first, openings[index])
                openings[index] = first
                board = chess.Board(first)
                opportunities = choices = 0
                for row in rows:
                    self.assertEqual(board.fen(), row["fen"])
                    move = chess.Move.from_uci(row["move"])
                    self.assertIn(move, board.legal_moves)
                    if row["learner"] == "True" and row["knightOpportunity"] == "True":
                        opportunities += 1
                        choices += int(row["knightChoice"] == "True")
                    board.push(move)
                detail = metrics["details"][index]
                self.assertEqual(detail["opportunities"], opportunities)
                self.assertEqual(detail["knightChoices"], choices)
                self.assertEqual(board.fen(), game.end().board().fen())
                self.assertEqual(game.headers["Result"], detail["result"])
                if detail["termination"] == "ply limit":
                    self.assertEqual(detail["result"], "*")
                    self.assertIsNone(detail["score"])
            self.assertEqual(metrics["wins"] + metrics["draws"] + metrics["losses"] + metrics["truncated"], len(games))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--study", type=Path)
    args, remaining = parser.parse_known_args()
    NativeOutputTests.study = args.study
    unittest.main(argv=[__file__, *remaining])
