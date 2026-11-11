"""Regression and executed-study checks for the native transformer experiment."""

import json
from pathlib import Path
import unittest

import chess
import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn.functional as F

from finetune_model import Maia3
from finetune_study import MODEL, ambiguity, digest, parity
from imitation_study import row_metrics, softmax
from native_data import position_key
from native_study import ROOT, encode, session


OUTPUT = ROOT / r"temp\doppelmaia-finetune-study"
DATASET = ROOT / r"temp\doppelmaia-readiness-study\human-dataset.json"


class TransformerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(4)
        torch.set_num_interop_threads(1)
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        if not torch.cuda.is_available():
            raise RuntimeError("Tests require real CUDA")
        ort.preload_dlls()
        cls.data = json.loads(DATASET.read_text())
        cls.tokens, cls.legal, cls.targets = encode(cls.data["players"][0]["splits"]["train"]["samples"][:4])

    def test_baseline_parity_and_backward(self):
        model = Maia3(MODEL).cuda()
        runtime = session(OUTPUT / "base-f32.onnx", True)
        records = parity(model, runtime, self.tokens, [1000, 1500, 2200])
        self.assertLess(max(r["policyMaximumAbsoluteError"] for r in records), 0.0005)
        x = torch.tensor(self.tokens[:2], device="cuda")
        elo = torch.full((2,), 1500.0, device="cuda")
        target = torch.tensor(self.targets[:2], device="cuda")
        legal = torch.tensor(self.legal[:2], device="cuda")
        for blocks in [1, 8]:
            model.zero_grad(set_to_none=True)
            parameters = model.configure(blocks)
            logits = model(x, elo, elo)[0]
            F.cross_entropy(logits.masked_fill(~legal, -1e9), target).backward()
            grads = [model.w(name).grad for name in model.keys if f"layers.{8 - blocks}." in name]
            self.assertTrue(any(g is not None and float(g.norm()) > 0 for g in grads))
            self.assertGreater(parameters, 1_000_000)
            if blocks == 1:
                self.assertIsNone(model.w("model.transformer.layers.0.linear1.bias").grad)
                self.assertFalse(model.w("model.gab_shared_weight").requires_grad)
                self.assertIsNone(model.w("model.gab_shared_weight").grad)
        del model, runtime

    def test_exact_split_and_report_metrics(self):
        report = json.loads((OUTPUT / "finetune-report.json").read_text())
        self.assertEqual(report["protocol"]["datasetSHA256"], digest(DATASET))
        self.assertEqual(report["protocol"]["modelSHA256"], digest(MODEL))
        self.assertGreaterEqual(len(report["players"]), 3)
        by_name = {p["name"]: p for p in self.data["players"]}
        for result in report["players"]:
            source = by_name[result["name"]]
            game_sets = [set(source["splits"][name]["gameIds"]) for name in ["train", "validation", "test"]]
            self.assertFalse(game_sets[0] & game_sets[1] or game_sets[0] & game_sets[2] or game_sets[1] & game_sets[2])
            self.assertEqual(result["counts"], {name: len(split["samples"]) for name, split in source["splits"].items()})
            folder = OUTPUT / result["name"]
            selection = json.loads((folder / "validation-selection.json").read_text())
            valid = [c for c in selection["candidates"] if not c.get("randomLabels")]
            self.assertEqual(result["selected"], min(valid, key=lambda c: c["selectedNovelValidationCE"])["id"])
            with np.load(folder / "split-identity.npz") as identity, np.load(folder / "sealed-test-predictions.npz") as saved:
                test_samples = source["splits"]["test"]["samples"]
                _, expected_legal, expected_targets = encode(test_samples)
                np.testing.assert_array_equal(saved["targets"], expected_targets)
                np.testing.assert_array_equal(saved["legal"], expected_legal)
                train_keys = {position_key(chess.Board(s["fen"])) for s in source["splits"]["train"]["samples"]}
                validation_keys = {position_key(chess.Board(s["fen"])) for s in source["splits"]["validation"]["samples"]}
                test_keys = [position_key(chess.Board(s["fen"])) for s in test_samples]
                np.testing.assert_array_equal(identity["novel"], [key not in train_keys for key in test_keys])
                np.testing.assert_array_equal(identity["strictNovel"],
                                              [key not in train_keys | validation_keys for key in test_keys])
                for candidate in result["candidates"]:
                    self.assertTrue(any(value > 0 for value in candidate["transformerGradientNorms"].values()))
                    for group in ["all", "novel", "strictNovel", "familiar", "opening"]:
                        mask = identity[group]
                        if not mask.any():
                            continue
                        metrics = row_metrics(softmax(saved[candidate["id"]][mask], saved["legal"][mask]),
                                              saved["targets"][mask])[0]
                        self.assertAlmostEqual(metrics["crossEntropy"], candidate["test"][group]["crossEntropy"], places=6)
                        self.assertAlmostEqual(metrics["moveMatch"], candidate["test"][group]["moveMatch"], places=10)
            self.assertEqual(result["exportSHA256"], digest(Path(result["exportPath"])))

    def test_partial_cached_prefix_remains_exact_after_update(self):
        model = Maia3(MODEL).cuda()
        model.configure(1)
        x = torch.tensor(self.tokens[:2], device="cuda")
        elo = torch.full((2,), 1500.0, device="cuda")
        with torch.no_grad():
            prefix = model.embedding(x, elo, elo)
            for index in range(7):
                prefix = model.block(prefix, index)
        optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=3e-5)
        legal = torch.tensor(self.legal[:2], device="cuda")
        target = torch.tensor(self.targets[:2], device="cuda")
        logits = model.heads(model.block(prefix, 7))[0]
        F.cross_entropy(logits.masked_fill(~legal, -1e9), target).backward()
        optimizer.step()
        with torch.no_grad():
            cached = model.heads(model.block(prefix, 7))[0]
            recomputed = model(x, elo, elo)[0]
        torch.testing.assert_close(cached, recomputed, rtol=0, atol=1e-5)

    def test_export_topology_and_multiple_rating_parity(self):
        report = json.loads((OUTPUT / "finetune-report.json").read_text())
        baseline = onnx.load(str(OUTPUT / "base-f32.onnx"))
        for result in report["players"]:
            model = Maia3(MODEL).cuda()
            chosen = next(c for c in result["candidates"] if c["id"] == result["selected"])
            model.load_state_dict(torch.load(chosen["checkpoint"], map_location="cuda", weights_only=True))
            exported = onnx.load(result["exportPath"])
            self.assertEqual([n.SerializeToString() for n in baseline.graph.node],
                             [n.SerializeToString() for n in exported.graph.node])
            self.assertEqual([v.name for v in exported.graph.input], ["tokens", "elo_self", "elo_oppo"])
            self.assertEqual([v.name for v in exported.graph.output], ["logits_move", "logits_value"])
            self.assertFalse(any(n.domain not in ("", "ai.onnx") for n in exported.graph.node))
            runtime = session(Path(result["exportPath"]), True)
            parity(model, runtime, self.tokens, [1000, result["rating"], 2200])
            changed = [name for name in model.keys
                       if not np.array_equal(model.w(name).detach().cpu().numpy(), model.initial[name])]
            if chosen["bestEpoch"] > 0:
                self.assertTrue(any("layers." in name or name.startswith("onnx::MatMul") for name in changed))
            del model, runtime

    def test_ambiguity_is_observational_not_a_perfection_claim(self):
        result = ambiguity(["a", "a", "a", "b"], np.array([1, 1, 2, 3]))
        self.assertEqual(result["conflictingInputs"], 1)
        self.assertEqual(result["conflictingRows"], 3)
        self.assertEqual(result["empiricalDeterministicOracleTop1"], 0.75)
        self.assertIn("not a population", result["warning"])


if __name__ == "__main__":
    unittest.main()
