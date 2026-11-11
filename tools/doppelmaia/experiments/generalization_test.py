"""Check source-account auditing, sealed selections and reproduced test metrics."""

import argparse
from collections import defaultdict
import csv
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from generalization_data import prepare_player
from generalization_study import MODEL, audit_dataset, digest, keys
from native_review import chart


def audit_fixture(directory, bot=False):
    name = "Example"
    blocks, games = [], []
    for index, split in enumerate(["train", "validation", "test"]):
        block = (f'[White "A"]\n[Black "B"]\n[WhiteTitle "{"BOT" if bot else ""}"]\n\n'
                 "1. e4 e5 *\n\n").encode()
        blocks.append(block)
        games.append({"id": str(index), "source": f"game-{index}", "split": split,
                      "date": f"2026.01.0{index + 1}", "time": "12:00:00",
                      "playerRating": 1200 if split == "train" else 2400})
    (directory / "source-games").mkdir()
    raw = b"".join(blocks)
    (directory / "source-games" / f"{name}.pgn").write_bytes(raw)
    index = {"names": {name: "A"}, "files": {name: {
        "sha256": hashlib.sha256(raw).hexdigest(),
        "rows": [[i + 1, len(block)] for i, block in enumerate(blocks)]}}}
    (directory / "source-index.json").write_text(json.dumps(index))
    return {"version": 2, "players": [{"name": name, "sourceGames": 3,
        "medianRating": 1200, "games": games,
        "splits": {row["split"]: {"samples": [{"gameId": row["id"]}]} for row in games}}]}


class AuditTests(unittest.TestCase):
    def test_collector_excludes_a_bot_even_if_earlier_games_were_untagged(self):
        untagged = b'[White "A"]\n[Black "B"]\n\n1. e4 e5 *\n'
        tagged = b'[White "B"]\n[Black "A"]\n[BlackTitle "BOT"]\n\n1. e4 e5 *\n'
        result = prepare_player(("Example", "A", [(1, untagged), (2, tagged)], 1, 200, 200))
        self.assertIn("BOT", result["excluded"])
        self.assertEqual(result["botTitleGames"], 1)

    def test_audit_checks_source_titles_independently_of_the_collector(self):
        for bot in [False, True]:
            with self.subTest(bot=bot), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                data = audit_fixture(directory, bot)
                if bot:
                    with self.assertRaisesRegex(ValueError, "source account audit"):
                        audit_dataset(data, directory)
                else:
                    self.assertEqual(audit_dataset(data, directory)[0]["botTitleGames"], 0)

    def test_audit_rejects_rating_leakage_wrong_splits_and_source_mutation(self):
        for fault in ["rating", "chronology", "duplicate", "ownership", "bytes"]:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                data = audit_fixture(directory)
                player = data["players"][0]
                if fault == "rating":
                    player["medianRating"] = 2400
                elif fault == "chronology":
                    player["games"][0]["date"] = "2026.01.09"
                elif fault == "duplicate":
                    player["games"][1]["source"] = player["games"][0]["source"]
                elif fault == "ownership":
                    player["splits"]["test"]["samples"][0]["gameId"] = "0"
                else:
                    (directory / "source-games" / "Example.pgn").write_bytes(b"changed")
                with self.assertRaises(ValueError):
                    audit_dataset(data, directory)

    def test_shared_learning_chart_marks_the_actual_checkpoint(self):
        series = [("Training", [(0, 2), (1, 1)]), ("Validation", [(0, 2), (1, 1.8)])]
        rendered = chart(series, "Epoch", "Loss", colors=["#dfc67e", "#89bfdb"], marker=1)
        self.assertIn('stroke="#dfc67e"', rendered)
        self.assertIn('stroke-dasharray="4 4"', rendered)
        with self.assertRaises(ValueError):
            chart(series, "Epoch", "Loss", marker=2)


class OutputTests(unittest.TestCase):
    dataset = None
    study = None

    @classmethod
    def setUpClass(cls):
        if cls.dataset is None or cls.study is None:
            raise unittest.SkipTest("Pass --dataset and --study to check the actual research outputs")
        cls.data = json.loads(cls.dataset.read_text())
        cls.report = json.loads((cls.study / "generalization-report.json").read_text())

    def test_source_identity_and_validation_only_selection(self):
        protocol = self.report["protocol"]
        self.assertEqual(digest(self.dataset), protocol["datasetSHA256"])
        self.assertEqual(digest(MODEL), protocol["modelSHA256"])
        self.assertEqual(audit_dataset(self.data, self.dataset.parent), protocol["accountAudit"])
        for name, sha256 in protocol["sourceSHA256"].items():
            self.assertEqual(digest(Path(__file__).with_name(name)), sha256)
        saved = json.loads((self.study / "validation-selections.json").read_text())
        self.assertEqual(saved["players"], [row["selection"] for row in self.report["players"]])
        for player in self.report["players"]:
            candidates = player["selection"]["candidates"]
            self.assertEqual(player["selected"], min(candidates, key=lambda row: row["exportedObjectiveLoss"])["id"])
            for candidate in candidates:
                self.assertEqual(digest(self.study / player["name"] / candidate["export"]), candidate["exportSHA256"])
                chosen = next(point for point in candidate["history"] if point["epoch"] == candidate["bestEpoch"])
                self.assertLessEqual(chosen["validationLoss"], min(row["validationLoss"] for row in candidate["history"]) + 1e-5)
        self.assertEqual(digest(self.study / self.report["players"][0]["name"] / "random-labels.onnx"),
                         saved["randomControl"]["exportSHA256"])

    def test_prediction_rows_reproduce_metrics_and_strict_novelty(self):
        for result in self.report["players"]:
            player = next(row for row in self.data["players"] if row["name"] == result["name"])
            seen = set(keys(player["splits"]["train"]["samples"]))
            seen_all = seen | set(keys(player["splits"]["validation"]["samples"]))
            samples = player["splits"]["test"]["samples"]
            test_keys = keys(samples)
            source_ids = {row["id"]: row["source"] for row in player["games"]}
            groups = defaultdict(list)
            with (self.study / result["name"] / "predictions.csv").open(newline="", encoding="utf-8") as file:
                for row in csv.DictReader(file):
                    index = int(row["sample"])
                    self.assertEqual(row["gameId"], source_ids[samples[index]["gameId"]])
                    self.assertEqual(row["strictNovel"] == "True", test_keys[index] not in seen_all)
                    self.assertEqual(row["novel"] == "True", test_keys[index] not in seen)
                    self.assertEqual(row["familiar"] == "True", test_keys[index] in seen)
                    self.assertAlmostEqual(float(row["crossEntropy"]),
                                           -np.log(max(float(row["probability"]), 1e-30)), delta=1e-5)
                    groups[row["method"]].append(row)
            self.assertEqual(set(groups), set(result["methods"]))
            for method, rows in groups.items():
                self.assertEqual({int(row["sample"]) for row in rows}, set(range(len(samples))))
                for group, metrics in result["methods"][method].items():
                    if "positions" not in metrics:
                        continue
                    if group == "all":
                        selected = rows
                    elif group in ["opening", "later"]:
                        selected = [row for row in rows if (int(row["ply"]) < 24) == (group == "opening")]
                    else:
                        selected = [row for row in rows if row[group] == "True"]
                    self.assertEqual(len(selected), metrics["positions"])
                    self.assertAlmostEqual(np.mean([int(row["match"]) for row in selected]), metrics["moveMatch"], places=12)
                    self.assertAlmostEqual(np.mean([float(row["crossEntropy"]) for row in selected]),
                                           metrics["crossEntropy"], delta=2e-6)

    def test_pooled_summary_preserves_counts_and_account_weighting(self):
        for group, methods in self.report["summary"].items():
            for method, result in methods.items():
                rows = [player["methods"][method][group] for player in self.report["players"]
                        if method in player["methods"] and group in player["methods"][method]]
                self.assertEqual(result["accounts"], len(rows))
                self.assertEqual(result["positions"], sum(row["positions"] for row in rows))
                self.assertAlmostEqual(result["equalAccountMoveMatch"], np.mean([row["moveMatch"] for row in rows]))
                self.assertAlmostEqual(result["moveMatch"],
                    sum(row["moveMatch"] * row["positions"] for row in rows) / result["positions"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path)
    parser.add_argument("--study", type=Path)
    args, remainder = parser.parse_known_args()
    OutputTests.dataset, OutputTests.study = args.dataset, args.study
    unittest.main(argv=[__file__, *remainder])
