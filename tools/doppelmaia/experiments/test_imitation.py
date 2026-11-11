"""Verify saved imitation results and native to browser repertoire arithmetic."""

import argparse
from collections import defaultdict
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import chess
import numpy as np
import torch

from imitation_followup import opening_paths
from imitation_study import build_repertoire
from native_data import position_key
from native_study import BRIDGE, WIDTH, fit, torch_pack


class RepertoireTests(unittest.TestCase):
    def test_full_training_plan_matches_cuda_including_validation_selection(self):
        self.assertTrue(torch.cuda.is_available(), "This parity test requires CUDA")
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.set_num_threads(8)
        generator = np.random.default_rng(42)
        features = generator.uniform(-1, 1, (44, 512)).astype(np.float32)
        samples = [{"features": row.tolist(), "legal": [1, 200], "base": [0.2, -0.5],
                    "target": 1, "targets": [0.3, 0.7]} for row in features]
        with tempfile.TemporaryDirectory() as folder:
            fixture, result = Path(folder) / "fixture.json", Path(folder) / "result.bin"
            fixture.write_text(json.dumps({"samples": samples[:35], "validation": samples[35:], "epochs": 8}))
            subprocess.run(["node", str(BRIDGE), "train", str(fixture), str(result)], check=True)
            browser = np.fromfile(result, dtype=np.float32)
            browser_report = json.loads(Path(str(result) + ".json").read_text())
        base = np.zeros((44, WIDTH), np.float32)
        base[:, [1, 200]] = [0.2, -0.5]
        legal = np.zeros((44, WIDTH), bool)
        legal[:, [1, 200]] = True
        target = np.full(44, 200)
        soft = torch.zeros((44, WIDTH), device="cuda")
        soft[:, [1, 200]] = torch.tensor([0.3, 0.7], device="cuda")
        train = torch_pack(features[:35], base[:35], legal[:35], target[:35], "cuda")
        validation = torch_pack(features[35:], base[35:], legal[35:], target[35:], "cuda")
        matrix, bias, report = fit(train, validation, 0, epochs=8, learning_rate=0.005,
                                   soft_targets=soft[:35], validation_targets=soft[35:])
        native = np.concatenate([matrix.ravel(), bias])
        self.assertLess(float(np.max(np.abs(native - browser))), 2e-6)
        self.assertEqual(report["bestEpoch"], browser_report["bestEpoch"])
        for a, b in zip(report["history"], browser_report["history"], strict=True):
            self.assertLess(abs(a["validationLoss"] - b["validationLoss"]), 2e-6)

    def test_multiple_full_feature_updates_match_pytorch(self):
        torch.set_num_threads(8)
        features = np.random.default_rng(42).uniform(-1, 1, (3, 512)).astype(np.float32)
        samples = [{"features": row.tolist(), "legal": [1, 200], "base": [0.2, -0.5],
                    "target": 1, "targets": [0.3, 0.7]} for row in features]
        with tempfile.TemporaryDirectory() as folder:
            fixture, result = Path(folder) / "fixture.json", Path(folder) / "result.bin"
            fixture.write_text(json.dumps({"samples": samples, "learningRate": 0.005, "steps": 4}))
            subprocess.run(["node", str(BRIDGE), "step", str(fixture), str(result)], check=True)
            browser = np.fromfile(result, dtype=np.float32)
        matrix = torch.zeros((512, WIDTH), requires_grad=True)
        bias = torch.zeros(WIDTH, requires_grad=True)
        optimizer = torch.optim.SGD([matrix, bias], lr=0.005, momentum=0.9, weight_decay=0.0001)
        for _ in range(4):
            optimizer.zero_grad()
            logits = torch.tensor(features) @ matrix[:, [1, 200]] + bias[[1, 200]] + torch.tensor([0.2, -0.5])
            loss = -(logits.log_softmax(-1) * torch.tensor([0.3, 0.7])).sum(-1).mean()
            loss.backward()
            optimizer.step()
        native = np.concatenate([matrix.detach().numpy().ravel(), bias.detach().numpy()])
        self.assertLess(float(np.max(np.abs(native - browser))), 2e-7)

    def test_native_counts_match_the_browser_including_anchor(self):
        fen = chess.Board().fen()
        samples = [{"fen": fen, "ply": 0, "features": [0.25] * 512, "legal": [1, 200],
                    "base": [0.2, -0.5], "target": 1, "targets": [0, 1]} for _ in range(3)]
        native_samples = [{"fen": fen, "ply": 0} for _ in samples]
        base = np.exp(np.array([0.2, -0.5]) - 0.2)
        base /= base.sum()
        probabilities = np.zeros((3, WIDTH), np.float32)
        probabilities[:, [1, 200]] = base
        native = build_repertoire(native_samples, [position_key(chess.Board(fen))] * 3,
                                  probabilities, np.array([200] * 3), anchor=0.5)
        with tempfile.TemporaryDirectory() as folder:
            fixture, result = Path(folder) / "fixture.json", Path(folder) / "result.json"
            fixture.write_text(json.dumps({"samples": samples, "anchor": 0.5}))
            subprocess.run(["node", str(BRIDGE), "repertoire", str(fixture), str(result)], check=True)
            browser = json.loads(result.read_text())
        self.assertEqual(len(browser), 1)
        self.assertEqual(browser[0]["observations"], 3)
        self.assertLess(float(np.max(np.abs(np.array(browser[0]["delta"]) - next(iter(native.values()))))), 1e-6)

    def test_prefix_checks_require_every_own_move_and_do_not_count_incomplete_paths(self):
        samples = [{"gameId": "a", "ply": i * 2} for i in range(4)]
        samples += [{"gameId": "b", "ply": i * 2} for i in range(2)]
        probs = np.array([[0.8, 0.2], [0.7, 0.3], [0.1, 0.9], [0.8, 0.2],
                          [0.9, 0.1], [0.8, 0.2]])
        result = opening_paths(samples, probs, np.zeros(6, np.int64))
        self.assertEqual(result["1"]["greedyExactOwnMovePrefix"], 1)
        self.assertEqual(result["2"]["greedyExactOwnMovePrefix"], 1)
        self.assertEqual(result["4"]["games"], 1)
        self.assertEqual(result["4"]["greedyExactOwnMovePrefix"], 0)
        self.assertNotIn("6", result)


class SavedImitationTests(unittest.TestCase):
    study = None

    def setUp(self):
        if self.study is None:
            self.skipTest("Pass --study to check generated results")
        self.main = json.loads((self.study / "imitation-report.json").read_text())
        self.follow = json.loads((self.study / "imitation-followup.json").read_text())

    def test_hashes_ownership_and_opening_sources(self):
        data_file = self.study / "human-dataset.json"
        digest = hashlib.sha256(data_file.read_bytes()).hexdigest()
        self.assertEqual(digest, self.main["datasetSHA256"])
        self.assertEqual(digest, self.follow["datasetSHA256"])
        for player in json.loads(data_file.read_text())["players"]:
            known = set()
            chronology = [(row["date"], row["time"], row["source"]) for row in player["games"]]
            self.assertEqual(chronology, sorted(chronology))
            for name in ["train", "validation", "test"]:
                ids = set(player["splits"][name]["gameIds"])
                self.assertFalse(known & ids)
                known.update(ids)
            metadata = {row["id"]: row for row in player["games"]}
            for sample in player["testOpeningSamples"]:
                self.assertEqual(metadata[sample["gameId"]]["split"], "test")
                self.assertLess(sample["ply"], 24)
        for player, info in self.follow["exports"].items():
            path = self.study / f"{player}-personal.onnx"
            self.assertEqual(info["SHA256"], hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(info["bytes"], path.stat().st_size)
            self.assertLess(info["maximumLogitError"], 0.002)

    def test_test_prediction_csv_reproduces_every_rating_result(self):
        groups = defaultdict(list)
        with (self.study / "imitation-predictions.csv").open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                groups[(row["player"], row["elo"])].append(row)
        for player in self.main["players"]:
            for elo, metrics in player["transfer"].items():
                rows = groups[(player["name"], elo)]
                for which, prefix in [("base", "base"), ("personal", "personal")]:
                    self.assertEqual(len(rows), metrics[which]["positions"])
                    self.assertAlmostEqual(np.mean([float(row[prefix + "Loss"]) for row in rows]),
                                           metrics[which]["crossEntropy"], places=5)
                    self.assertAlmostEqual(np.mean([row[prefix + "Match"] == "True" for row in rows]),
                                           metrics[which]["moveMatch"], places=9)

    def test_opening_csv_reproduces_path_counts(self):
        grouped = defaultdict(list)
        with (self.study / "opening-predictions.csv").open(newline="", encoding="utf-8") as file:
            for row in csv.DictReader(file):
                grouped[row["player"]].append(row)
        for player in self.follow["players"]:
            by_game = defaultdict(list)
            for row in grouped[player["name"]]:
                by_game[row["gameId"]].append(row)
            for count in [1, 2, 4, 6]:
                eligible = [sorted(rows, key=lambda row: int(row["ply"]))[:count]
                            for rows in by_game.values() if len(rows) >= count]
                for which in ["base", "personal"]:
                    result = player["openingPaths"][which][str(count)]
                    self.assertEqual(len(eligible), result["games"])
                    match = np.mean([all(row[which + "Match"] == "True" for row in rows) for rows in eligible])
                    self.assertAlmostEqual(float(match), result["greedyExactOwnMovePrefix"], places=10)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--study", type=Path)
    args, remaining = parser.parse_known_args()
    SavedImitationTests.study = args.study
    unittest.main(argv=[__file__, *remaining])
