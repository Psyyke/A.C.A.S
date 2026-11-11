"""Reproduce published evidence from saved adapters, splits and predictions."""

import argparse
from collections import defaultdict
import csv
import hashlib
import json
from pathlib import Path
import unittest

import chess
import numpy as np
import torch

from imitation_study import softmax
from native_data import position_key
from native_study import encode, MOVES, canonical_move
from personality_study import metrics


class PersonalityEvidenceTests(unittest.TestCase):
    study = None

    def setUp(self):
        if self.study is None:
            self.skipTest("Pass --personalities to check completed evidence")
        self.report = json.loads((self.study / "personality-report.json").read_text())
        self.practice = json.loads((self.study / "practice.json").read_text())

    def test_all_presets_use_the_exact_shared_configuration_and_separate_inputs(self):
        self.assertEqual(len(self.report["profiles"]), 50)
        source = {row["id"]: row for row in self.practice["presets"]}
        self.assertEqual(set(source), {row["id"] for row in self.report["profiles"]})
        for row in self.report["profiles"]:
            self.assertEqual(row["configuration"], source[row["id"]])
            self.assertTrue(row["passed"])
            self.assertLess(row["personal"]["KL"], row["base"]["KL"])
            self.assertLess(row["KLChange95"]["high"], 0)
            self.assertGreater(row["scoreChange95"]["low"], 0)
        known_inputs, games = set(), set()
        for split in [self.practice["dataset"]["train"], self.practice["dataset"]["validation"], self.practice["test"]]:
            self.assertFalse(games & set(split["gameIds"]))
            games.update(split["gameIds"])
            keys = [position_key(chess.Board(row["fen"])) for row in split["samples"]]
            self.assertEqual(len(keys), len(set(keys)))
            self.assertFalse(known_inputs & set(keys))
            known_inputs.update(keys)
        self.assertEqual(self.report["practiceSHA256"], hashlib.sha256((self.study / "practice.json").read_bytes()).hexdigest())

    def test_saved_personalities_reproduce_reported_test_scores(self):
        torch.set_num_threads(8)
        samples = self.practice["test"]["samples"]
        _, legal, _ = encode(samples)
        offset = len(self.practice["dataset"]["train"]["samples"]) + len(self.practice["dataset"]["validation"]["samples"])
        rows = np.concatenate([np.full(len(sample["legalMoves"]), i, np.int64) for i, sample in enumerate(samples)])
        indices = np.array([MOVES[canonical_move(move, sample["fen"].split()[1] == "b")]
                            for sample in samples for move in sample["legalMoves"]])
        traits = np.concatenate(self.practice["moveFeatures"]["test"])
        for profile in self.report["profiles"]:
            with np.load(self.study / f"practice-{profile['elo']}-features.npz") as cached:
                base, features = cached["base"][offset:], cached["features"][offset:]
            with np.load(self.study / f"{profile['id']}-adapter.npz") as cached:
                matrix, bias = cached["matrix"], cached["bias"]
            weights = np.array([profile["configuration"]["weights"][trait["id"]] for trait in self.practice["traits"]])
            scores = np.zeros_like(base)
            scores[rows, indices] = traits @ weights * profile["configuration"]["strength"]
            target = softmax(base + scores, legal)
            for name, logits in [("base", base), ("personal", base + features @ matrix + bias)]:
                measured = metrics(softmax(logits, legal), target, scores)[0]
                self.assertAlmostEqual(measured["KL"], profile[name]["KL"], places=5)
                self.assertAlmostEqual(measured["score"], profile[name]["score"], places=5)

    def test_autonomous_games_have_real_legal_moves_and_honest_outcomes(self):
        report = json.loads((self.study / "personality-rollouts.json").read_text())
        self.assertEqual(len(report["profiles"]), 50)
        for profile in report["profiles"]:
            for outcomes in profile["outcomes"].values():
                self.assertEqual(sum(outcomes.values()), 8)
            self.assertGreater(profile["personalVisitedBoards"]["expectedScore"],
                               profile["personalVisitedBoards"]["baseExpectedScore"])
            moves = json.loads((self.study / f"{profile['id']}-rollout-moves.json").read_text())
            self.assertEqual(len(moves), profile["ownMoves"])
            for row in moves:
                board = chess.Board(row["fen"])
                self.assertIn(chess.Move.from_uci(row["move"]), board.legal_moves)
                self.assertAlmostEqual(sum(row["base"]), 1, places=5)
                self.assertAlmostEqual(sum(row["personal"]), 1, places=5)


class ReadinessEvidenceTests(unittest.TestCase):
    study = None

    def setUp(self):
        if self.study is None:
            self.skipTest("Pass --humans to check completed evidence")
        self.report = json.loads((self.study / "readiness-report.json").read_text())

    def test_twenty_players_chronological_splits_and_data_hash(self):
        self.assertEqual(len(self.report["players"]), 20)
        source_path = self.study / "human-dataset.json"
        self.assertEqual(self.report["datasetSHA256"], hashlib.sha256(source_path.read_bytes()).hexdigest())
        for player in json.loads(source_path.read_text())["players"]:
            owned = set()
            chronology = [(row["date"], row["time"], row["source"]) for row in player["games"]]
            self.assertEqual(chronology, sorted(chronology))
            for name in ["train", "validation", "test"]:
                ids = set(player["splits"][name]["gameIds"])
                self.assertFalse(owned & ids)
                owned.update(ids)

    def test_full_model_prediction_file_reproduces_the_report(self):
        groups = defaultdict(list)
        with (self.study / "readiness-predictions.csv").open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                groups[row["player"]].append(row)
        for player in self.report["players"]:
            rows = groups[player["name"]]
            self.assertEqual(len(rows), player["counts"]["test"])
            for source, prefix in [(player["base"], "base"), (player["settings"]["full-max"]["test"], "personal")]:
                for group, subset in [("all", rows), ("novel", [row for row in rows if row["familiar"] == "False"]),
                                       ("familiar", [row for row in rows if row["familiar"] == "True"])]:
                    loss = np.mean([-np.log(max(float(row[prefix + "Probability"]), 1e-30)) for row in subset])
                    accuracy = np.mean([row[prefix + "Match"] == "True" for row in subset])
                    self.assertAlmostEqual(float(loss), source[group]["crossEntropy"], places=5)
                    self.assertAlmostEqual(float(accuracy), source[group]["moveMatch"], places=9)

    def test_quality_checks_use_unique_boards_and_every_legal_move(self):
        for player in self.report["players"][:5]:
            rows = json.loads((self.study / f"{player['name']}-unique-quality.json").read_text())
            self.assertEqual(len(rows), 24)
            self.assertEqual(len({position_key(chess.Board(row["fen"])) for row in rows}), 24)
            for row in rows:
                self.assertEqual(row["nodesBudget"], 250000)
                self.assertEqual(set(row["losses"]), {move.uci() for move in chess.Board(row["fen"]).legal_moves})
                self.assertEqual(row["engineSHA256"], player["qualityStudy"]["engineSHA256"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--personalities", type=Path)
    parser.add_argument("--humans", type=Path)
    args, remaining = parser.parse_known_args()
    PersonalityEvidenceTests.study = args.personalities
    ReadinessEvidenceTests.study = args.humans
    unittest.main(argv=[__file__, *remaining])
