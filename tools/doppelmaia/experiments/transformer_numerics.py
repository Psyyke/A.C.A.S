"""Replay a saved CUDA training plan with algebraically equivalent unfused normalization."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from finetune_model import Maia3
from finetune_study import MODEL, save_json
from imitation_study import softmax
from native_study import encode


class UnfusedMaia3(Maia3):
    def ln(self, x, name):
        node = self.nodes["/model/" + name + "/LayerNormalization"]
        epsilon = next(value.f for value in node.attribute if value.name == "epsilon")
        centered = x - x.mean(-1, keepdim=True)
        normalized = centered / torch.sqrt(centered.square().mean(-1, keepdim=True) + epsilon)
        return normalized * self.w(node.input[1]) + self.w(node.input[2])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("The normalization control requires real CUDA")
    torch.set_num_threads(6)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    reference = json.loads((args.reference / "reference.json").read_text())
    if hashlib.sha256(MODEL.read_bytes()).hexdigest() != reference["modelSHA256"]:
        raise ValueError("Reference uses a different starting model")
    tokens, legal, targets = encode(reference["samples"])
    x = torch.tensor(tokens, device="cuda")
    mask = torch.tensor(legal, device="cuda")
    self_elo = torch.tensor(reference["eloSelf"], device="cuda")
    opponent_elo = torch.tensor(reference["eloOppo"], device="cuda")
    teacher = torch.tensor(reference["targets"], device="cuda")
    model = UnfusedMaia3(MODEL).cuda()
    model.configure(8)

    @torch.no_grad()
    def predict():
        return np.concatenate([model(x[start:start + 16], self_elo[start:start + 16],
                                     opponent_elo[start:start + 16])[0].cpu().numpy()
                               for start in range(0, len(x), 16)])

    initial = predict()
    settings = reference["options"]
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],
                                 lr=settings["learningRate"], weight_decay=settings["weightDecay"], foreach=False)
    losses = []
    for step in reference["steps"]:
        ids = torch.tensor(step["indices"], device="cuda")
        optimizer.zero_grad(set_to_none=True)
        logits = model(x[ids], self_elo[ids], opponent_elo[ids])[0].masked_fill(~mask[ids], -1e9)
        loss = -(teacher[ids] * logits.log_softmax(-1)).sum(-1).mean()
        if not torch.isfinite(loss):
            raise ValueError("Unfused control produced nonfinite loss")
        loss.backward()
        norm = torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], settings["clipNorm"])
        if not torch.isfinite(norm):
            raise ValueError("Unfused control produced nonfinite gradients")
        optimizer.step()
        losses.append(float(loss.detach()))
    final = predict()
    expected = np.array(reference["final"], np.float32)
    p, q = softmax(final, legal), softmax(expected, legal)
    report = {"referenceSHA256": hashlib.sha256((args.reference / "reference.json").read_bytes()).hexdigest(),
        "modelSHA256": reference["modelSHA256"], "torch": torch.__version__, "device": torch.cuda.get_device_name(),
        "steps": len(losses), "control": "Only fused LayerNorm is replaced with mean, subtract, square, mean, sqrt and divide",
        "initialPolicyMaximumError": float(np.max(np.abs(initial - np.array(reference["baseline"], np.float32)))),
        "finalPolicyMaximumDifference": float(np.max(np.abs(final - expected))),
        "finalPolicyRMSE": float(np.sqrt(np.mean((final - expected) ** 2))),
        "maximumStepLossDifference": float(np.max(np.abs(np.array(losses) - [row["loss"] for row in reference["steps"]]))),
        "meanPolicyKL": float((q * (np.log(np.maximum(q, 1e-30)) - np.log(np.maximum(p, 1e-30)))).sum(1).mean()),
        "topMoveAgreement": float(np.mean(p.argmax(1) == q.argmax(1))),
        "maximumLegalProbabilityDifference": float(np.abs(p - q).max()),
        "fusedRecordedCE": float(-np.log(np.maximum(q[np.arange(len(targets)), targets], 1e-30)).mean()),
        "unfusedRecordedCE": float(-np.log(np.maximum(p[np.arange(len(targets)), targets], 1e-30)).mean()),
        "losses": losses}
    if report["initialPolicyMaximumError"] > 0.001:
        raise AssertionError("The normalization control does not start from equivalent predictions")
    save_json(args.reference / "normalization-control.json", report)
    print(json.dumps({key: value for key, value in report.items() if key != "losses"}, indent=2))


if __name__ == "__main__":
    main()
