"""Output-integrity checks; run after original_study.py and original_review.py."""

import csv
import hashlib
import json
from pathlib import Path
import unittest

import numpy as np
import onnx
import torch

from original_study import MODELS, ROOT, independent_planes, tensors, update

OUTPUT = ROOT / "temp" / "doppelmaia-original-comparison"


class OriginalComparison(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads((OUTPUT / "report.json").read_text())
        cls.dataset = json.loads((OUTPUT / "dataset.json").read_text())

    def test_strict_real_game_holdouts(self):
        splits = self.dataset["splits"]
        ids = [{sample["gameId"] for sample in splits[key]} for key in ["train", "validation", "test"]]
        for a, b in [(0, 1), (0, 2), (1, 2)]:
            self.assertFalse(ids[a] & ids[b])
        self.assertEqual([len(splits[key]) for key in ["train", "validation", "test"]], [256, 64, 128])
        seen = set()
        games = {game["id"]: game for game in self.dataset["games"]}
        for split, samples in splits.items():
            for sample in samples:
                self.assertEqual(games[sample["gameId"]]["split"], split)
                self.assertTrue(games[sample["gameId"]]["source"].startswith("https://lichess.org/"))
                self.assertEqual(len(sample["history"]), 8)
                self.assertEqual(len(sample["repetitions"]), 8)
                self.assertIn(sample["move"], sample["legalMoves"])
                key = " ".join(sample["history"][0].split()[:2])
                self.assertNotIn(key, seen)
                seen.add(key)

    def test_fingerprints_and_independent_encoding(self):
        self.assertEqual(hashlib.sha256((OUTPUT / "dataset.json").read_bytes()).hexdigest(),
                         self.report["datasetSha256"])
        samples = [row for key in ["train", "validation", "test"] for row in self.dataset["splits"][key]]
        planes = np.fromfile(OUTPUT / "planes.f32", np.float32).reshape(-1, 112, 8, 8)
        np.testing.assert_array_equal(planes, independent_planes(samples))

    def test_sensitive_actual_js_optimizer_parity(self):
        proof = self.report["optimizerParity"]
        self.assertEqual(proof["updates"], 12)
        self.assertEqual(proof["clippedBatches"], 12)
        self.assertLess(proof["maximumWeightError"], proof["tolerance"])
        for error in proof["mutationErrors"].values():
            self.assertGreater(error, proof["tolerance"])

    def test_decay_is_anchored_to_base_and_momentum_includes_bias(self):
        pack = tensors(np.zeros((1, 1, 8, 8), np.float32),
                       [{"legal": [0, 64], "target": 0}], list(range(1858)))
        matrix = torch.full((80, 1, 3, 3), .8, device="cuda", requires_grad=True)
        bias = torch.full((80,), .8, device="cuda", requires_grad=True)
        base = [torch.full_like(matrix, .7), torch.full_like(bias, .7)]
        velocity = [torch.full_like(matrix, .3), torch.full_like(bias, .3)]
        norm, scale = update(matrix, bias, base, velocity, pack, .005)
        self.assertAlmostEqual(norm, np.sqrt(.5), places=6)
        self.assertEqual(scale, 1.)
        self.assertAlmostEqual(float(velocity[0][0, 0, 0, 0]), .27001, places=6)
        self.assertAlmostEqual(float(velocity[1][0]), -.22999, places=6)
        self.assertAlmostEqual(float(velocity[1][1]), .77001, places=6)
        self.assertAlmostEqual(float(matrix[0, 0, 0, 0].detach()), .8 - .005 * .27001, places=6)

    def test_all_original_models_and_non_maia(self):
        self.assertEqual([model["model"] for model in self.report["models"]], MODELS)
        self.assertTrue(self.report["cudaRequired"])
        self.assertFalse(self.report["cpuFallback"])
        for model in self.report["models"]:
            with self.subTest(model=model["model"]):
                directory = OUTPUT / model["model"]
                self.assertEqual(hashlib.sha256((directory / "export" / "weights.pb").read_bytes()).hexdigest(),
                                 model["exportSha256"])
                self.assertEqual(hashlib.sha256((ROOT / "app" / "assets" / "lc0-nets" /
                                                (model["model"] + ".pb")).read_bytes()).hexdigest(),
                                 model["sourceSha256"])
                for error in model["parity"].values():
                    self.assertLess(error, .003)
                for proof in model["cudaExecution"].values():
                    self.assertEqual(set(proof["providers"]), {"CUDAExecutionProvider"})
                    self.assertGreater(proof["cudaConvolutionEvents"], 0)
                before = onnx.load(str(directory / "model.onnx"))
                after = onnx.load(str(directory / "export" / "model.onnx"))
                onnx.checker.check_model(after)
                original = {tensor.name: tensor.SerializeToString() for tensor in before.graph.initializer}
                trained = {tensor.name: tensor.SerializeToString() for tensor in after.graph.initializer}
                candidate_model = onnx.load(str(directory / "candidate" / "model.onnx"))
                onnx.checker.check_model(candidate_model)
                candidate = {tensor.name: tensor.SerializeToString() for tensor in candidate_model.graph.initializer}
                self.assertEqual(original.keys(), trained.keys())
                self.assertEqual(original.keys(), candidate.keys())
                for name in original:
                    if name not in ["/policy/conv2/w/kernel", "/policy/conv2/w/bias"]:
                        self.assertEqual(original[name], trained[name], name)
                        self.assertEqual(original[name], candidate[name], name)
                self.assertNotEqual(original["/policy/conv2/w/kernel"], candidate["/policy/conv2/w/kernel"])
                self.assertNotEqual(model["candidate"]["pbSha256"], model["sourceSha256"])
                self.assertLess(model["candidate"]["onnxParity"], .003)
                if not model["retained"]:
                    self.assertEqual(model["sourceSha256"], model["exportSha256"])
                self.assertLessEqual(len(model["history"]) - 1, 10)

    def test_prediction_metrics_and_reviewer(self):
        for model in self.report["models"]:
            with (OUTPUT / model["model"] / "test-predictions.csv").open(newline="") as stream:
                predictions = list(csv.DictReader(stream))
            self.assertEqual(len(predictions), 128)
            for field, stage in [("before", "baseline"), ("after", "exported")]:
                agreement = sum(row[field] == row["target"] for row in predictions) / len(predictions)
                self.assertAlmostEqual(agreement, model[stage]["test"]["accuracy"], places=7)
        reviewer = (OUTPUT / "review.html").read_text(encoding="utf-8")
        self.assertNotIn('src="http', reviewer)
        self.assertIn("Pooled players", reviewer)
        with (OUTPUT / "summary.csv").open(newline="") as stream:
            self.assertEqual(len(list(csv.DictReader(stream))), 11)


if __name__ == "__main__":
    unittest.main()
