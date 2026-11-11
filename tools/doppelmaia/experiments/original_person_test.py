"""Validate the larger single-player original-Maia study outputs."""

import csv
import hashlib
import json
from pathlib import Path
import unittest

import numpy as np
import onnx

from original_study import independent_planes

DIRECTORY = Path(r"temp\doppelmaia-original-person")


class SinglePlayerStudy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = json.loads((DIRECTORY / "dataset.json").read_text())
        cls.report = json.loads((DIRECTORY / "report.json").read_text())

    def test_one_anonymized_player_game_separation_chronology(self):
        self.assertEqual(self.dataset["player"], "Player01")
        self.assertTrue(1450 <= self.dataset["medianRating"] <= 1550)
        self.assertEqual(self.dataset["sourceGames"], 715)
        games = {row["id"]: row for row in self.dataset["games"]}
        all_ids, dates = [], []
        seen = set()
        for split, cap in [("train", 1024), ("validation", 256), ("test", 512)]:
            samples = self.dataset["splits"][split]
            self.assertEqual(len(samples), cap)
            ids = {row["gameId"] for row in samples}
            all_ids.append(ids)
            self.assertGreater(len(ids), 80)
            dates.append(sorted((games[key]["date"], games[key]["time"]) for key in ids))
            for sample in samples:
                record = games[sample["gameId"]]
                self.assertEqual(record["split"], split)
                self.assertEqual(sample["history"][0].split()[1] == "w", record["playerColor"] == "white")
                self.assertEqual(len(sample["history"]), 8)
                key = " ".join(sample["history"][0].split()[:2])
                self.assertNotIn(key, seen)
                seen.add(key)
        self.assertFalse(all_ids[0] & all_ids[1] or all_ids[0] & all_ids[2] or all_ids[1] & all_ids[2])
        self.assertLessEqual(dates[0][-1], dates[1][0])
        self.assertLessEqual(dates[1][-1], dates[2][0])
        self.assertNotIn('"White":', (DIRECTORY / "dataset.json").read_text())
        self.assertNotIn('"Black":', (DIRECTORY / "dataset.json").read_text())

    def test_exact_js_encoding_and_dataset_fingerprint(self):
        samples = [row for key in ["train", "validation", "test"] for row in self.dataset["splits"][key]]
        planes = np.fromfile(DIRECTORY / "planes.f32", np.float32).reshape(-1, 112, 8, 8)
        np.testing.assert_array_equal(planes, independent_planes(samples))
        self.assertEqual(self.report["datasetSha256"], hashlib.sha256((DIRECTORY / "dataset.json").read_bytes()).hexdigest())

    def test_model_api_training_export_cuda_parity(self):
        self.assertEqual([row["model"] for row in self.report["models"]], ["maia-1500", "tinygyal-8"])
        for model in self.report["models"]:
            for error in model["parity"].values():
                self.assertLess(error, .003)
            self.assertLess(model["parity"]["lastUpdatedJsTrainingWeights"], 2e-5)
            self.assertLess(model["parity"]["completeJsTrainingMetrics"], .0003)
            for proof in model["cudaExecution"].values():
                self.assertEqual(set(proof["providers"]), {"CUDAExecutionProvider"})
                self.assertGreater(proof["cudaConvolutionEvents"], 0)
            directory = DIRECTORY / model["model"]
            original = {t.name: t.SerializeToString() for t in onnx.load(str(directory / "model.onnx")).graph.initializer}
            for stage in ["candidate", "export"]:
                converted = onnx.load(str(directory / stage / "model.onnx"))
                onnx.checker.check_model(converted)
                for tensor in converted.graph.initializer:
                    if tensor.name not in ["/policy/conv2/w/kernel", "/policy/conv2/w/bias"]:
                        self.assertEqual(original[tensor.name], tensor.SerializeToString())
            if not model["retained"]:
                self.assertEqual(model["sourceSha256"], model["exportSha256"])
            with (directory / "test-predictions.csv").open(newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(len(rows), 512)
            self.assertAlmostEqual(sum(row["target"] == row["after"] for row in rows) / 512,
                                   model["exported"]["test"]["accuracy"])

    def test_reviewer_and_cluster_uncertainty(self):
        summary = json.loads((DIRECTORY / "person-summary.json").read_text())
        self.assertEqual(len(summary["models"]), 2)
        self.assertIn("cluster", summary["interpretation"])
        self.assertIn("One anonymized player", (DIRECTORY / "review.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
