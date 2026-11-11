"""CUDA regression tests for causal context, adaptation and merged ONNX exports."""

import gc
from pathlib import Path
import tempfile
import unittest

import chess
import numpy as np
import torch
import torch.nn.functional as F

from context_models import history_tokens
from context_training import ContextTrainable, fit_context
from finetune_model import Maia3
from finetune_study import MODEL
from native_study import encode, feeds, session
from transformer_workflow import fit_full


def game_samples(moves, game_id):
    board, past, samples = chess.Board(), [], []
    for ply, san in enumerate(moves.split()):
        fen = board.fen()
        history = [fen, *past][:8]
        move = board.parse_san(san)
        samples.append({"fen": fen, "history": history, "move": move.uci(), "gameId": game_id,
                        "ply": ply, "legalMoves": [item.uci() for item in board.legal_moves]})
        past = history
        board.push(move)
    return samples


class ContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not torch.cuda.is_available():
            raise RuntimeError("These model and update regression tests require CUDA")
        torch.set_num_threads(8)
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        cls.training = game_samples("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5", "train")
        cls.validation = game_samples("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7", "validation")
        cls.options = {"epochs": 2, "batchSize": 4, "patience": 3, "baseAnchor": 0.25,
                       "learningRate": 1e-5, "weightDecay": 0.01, "seed": 42}

    def tearDown(self):
        gc.collect()
        torch.cuda.empty_cache()

    def test_history_orientation_padding_and_current_board(self):
        tokens, _, _ = history_tokens(self.training)
        current, _, _ = encode(self.training)
        np.testing.assert_array_equal(tokens[:, :, -12:], current)
        for row in range(len(self.training)):
            expected = [max(0, row - 7 + frame) for frame in range(8)]
            np.testing.assert_array_equal(tokens[row], np.concatenate(current[expected], axis=-1))
        invalid = [{**self.training[0], "history": [self.training[1]["fen"]]}]
        with self.assertRaises(ValueError):
            history_tokens(invalid)

    def test_low_rank_initialization_gradients_and_merged_export(self):
        arrays, legal, targets = history_tokens(self.training[:4])
        x, elo = torch.tensor(arrays, device="cuda"), torch.full((4,), 1800., device="cuda")
        model = ContextTrainable(MODEL, rank=32).cuda()
        reference = ContextTrainable(MODEL).cuda()
        with torch.no_grad():
            for name in model.keys:
                self.assertTrue(torch.equal(model.w(name), reference.w(name)), name)
            np.testing.assert_allclose(model(x, elo, elo)[0].cpu(), reference(x, elo, elo)[0].cpu(),
                                       atol=0.00002, rtol=0)
        del reference
        logits = model(x, elo, elo)[0].masked_fill(~torch.tensor(legal, device="cuda"), -1e9)
        F.cross_entropy(logits, torch.tensor(targets, device="cuda")).backward()
        trainable = [parameter for parameter in model.parameters() if parameter.requires_grad]
        self.assertTrue(all(parameter.grad is not None and torch.isfinite(parameter.grad).all()
                            for parameter in trainable))
        self.assertTrue(any(torch.count_nonzero(parameter.grad) for parameter in model.lora_right.values()))
        optimizer = torch.optim.AdamW(trainable, lr=1e-4)
        torch.nn.utils.clip_grad_norm_(trainable, 1)
        optimizer.step()
        self.assertTrue(any(torch.count_nonzero(parameter) for parameter in model.lora_right.values()))
        with torch.no_grad():
            policy, value, _ = model(x, elo, elo)
        with tempfile.TemporaryDirectory(prefix="acas-context-") as directory:
            path = Path(directory) / "merged.onnx"
            model.export(path)
            runtime = session(path, False)
            self.assertEqual(runtime.get_inputs()[0].shape[-1], 96)
            self.assertEqual(runtime.get_modelmeta().custom_metadata_map["acas.maia3.history"],
                             "8:oldest-first:per-frame-turn:earliest-padding")
            actual_policy, actual_value = runtime.run(["logits_move", "logits_value"], feeds(arrays, 1800))
            np.testing.assert_allclose(actual_policy, policy.detach().cpu(), atol=0.0003, rtol=0.00002)
            np.testing.assert_allclose(actual_value, value.detach().cpu(), atol=0.0001, rtol=0.00002)
            del runtime

    def test_repeated_control_matches_existing_training(self):
        original = Maia3(MODEL).cuda()
        options = {**self.options, "baseAnchor": 0}
        old = fit_full(original, self.training, self.validation, 1800, options, cuda_graphs=True)
        contextual = ContextTrainable(MODEL, history=False).cuda()
        new = fit_context(contextual, self.training, self.validation, 1800, options)
        np.testing.assert_allclose(
            [[row[key] for key in ["trainLoss", "validationLoss"]] for row in old["history"]],
            [[row[key] for key in ["trainLoss", "validationLoss"]] for row in new["history"]],
            atol=0.00001, rtol=0)
        self.assertEqual(old["bestEpoch"], new["bestEpoch"])
        for name in original.keys:
            np.testing.assert_allclose(original.w(name).detach().cpu(), contextual.w(name).detach().cpu(),
                                       atol=0.000002, rtol=0)

    def test_captured_low_rank_training(self):
        model = ContextTrainable(MODEL, rank=32, blocks=4).cuda()
        result = fit_context(model, self.training, self.validation, 1800,
                             {**self.options, "learningRate": 1e-4, "directRate": 1e-5})
        self.assertEqual(result["updates"], 6)
        self.assertGreater(result["novelValidationPositions"], 0)
        self.assertLess(result["trainableParameters"], 22409728)
        self.assertLess(result["history"][-1]["trainLoss"], result["history"][0]["trainLoss"])
        self.assertTrue(all(np.isfinite(point["validationLoss"]) for point in result["history"]))


if __name__ == "__main__":
    unittest.main()
