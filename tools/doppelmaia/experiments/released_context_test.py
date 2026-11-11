"""Verify the graph-compatible released-model path against the pinned upstream code."""

from pathlib import Path
import unittest

import chess
import torch

from context_models import history_tokens
from released_context_study import ReleasedTrainable
from transformer_workflow import capture_step


ROOT = Path(__file__).resolve().parents[3]


class ReleasedContextTests(unittest.TestCase):
    def test_upstream_forward_gradients_and_captured_update(self):
        if not torch.cuda.is_available():
            self.fail("This regression requires CUDA")
        torch.set_num_threads(8)
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        board, history, samples = chess.Board(), [], []
        for move in ["e2e4", "c7c5", "g1f3", "d7d6"]:
            history.insert(0, board.fen())
            samples.append({"fen": board.fen(), "history": list(history), "move": move,
                            "legalMoves": [candidate.uci() for candidate in board.legal_moves]})
            board.push_uci(move)
        tokens, masks, labels = [torch.as_tensor(value, device="cuda") for value in history_tokens(samples)]
        elos = torch.tensor([1200, 1600, 2000, 2400], dtype=torch.float32, device="cuda")
        model = ReleasedTrainable(ROOT / "temp" / "doppelmaia-upstream-v4",
                                  ROOT / "temp" / "doppelmaia-unseen-v4" / "weights", "23m").cuda().eval()
        expected = model.network(tokens, elos, elos)
        torch.nn.functional.cross_entropy(expected[0].masked_fill(~masks, -1e9), labels).backward()
        gradients = {name: parameter.grad.cpu().clone() for name, parameter in model.named_parameters()
                     if parameter.requires_grad}
        model.zero_grad(set_to_none=False)
        actual = model(tokens, elos, elos)
        for left, right in zip(actual, expected):
            torch.testing.assert_close(left, right, rtol=0, atol=2e-5)
        torch.nn.functional.cross_entropy(actual[0].masked_fill(~masks, -1e9), labels).backward()
        for name, parameter in model.named_parameters():
            if parameter.requires_grad:
                torch.testing.assert_close(parameter.grad.cpu(), gradients[name], rtol=1e-4, atol=2e-5)
        del actual, expected, gradients, left, right
        parameters = [parameter for parameter in model.parameters() if parameter.requires_grad]
        optimizer = torch.optim.AdamW(parameters, lr=1e-5, weight_decay=0.01, foreach=False, capturable=True)
        targets = torch.zeros_like(masks, dtype=torch.float32).scatter_(1, labels[:, None], 1)
        before = parameters[0].detach().clone()
        replay = capture_step(model, optimizer, tokens, masks, targets, elos, len(samples), 1)
        torch.testing.assert_close(parameters[0], before, rtol=0, atol=0)
        loss, norm = replay(torch.arange(len(samples), device="cuda"))
        self.assertTrue(torch.isfinite(loss).item())
        self.assertTrue(torch.isfinite(norm).item())
        self.assertFalse(torch.equal(parameters[0], before))
        self.assertEqual(optimizer.state[parameters[0]]["step"].item(), 1)


if __name__ == "__main__":
    unittest.main()
