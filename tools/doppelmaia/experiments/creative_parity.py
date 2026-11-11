"""Verify that the exploratory baseline reproduces the frozen contextual trainer."""

import argparse
import gc
import json
from pathlib import Path

import numpy as np
import torch

from context_models import history_tokens
from context_training import ContextTrainable, fit_context
from creative_study import fit, logits_for
from finetune_study import MODEL
from game_budget_study import fixed_novel_validation


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixture", type=Path)
    args = parser.parse_args()
    torch.set_num_threads(8)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    data = json.loads(args.fixture.read_text(encoding="utf-8"))
    training = data["dataset"]["train"]["samples"][:65]
    validation = fixed_novel_validation(training, data["dataset"]["validation"]["samples"])[:32]
    options = {"batchSize": 32, "learningRate": 1e-5, "epochs": 2, "patience": 2, "seed": 42, "baseAnchor": 0.25}
    original = ContextTrainable(MODEL).cuda()
    expected = fit_context(original, training, validation, data["elo"], options)
    expected_state = {key: value.detach().cpu().clone() for key, value in original.state_dict().items()}
    del original
    gc.collect()
    torch.cuda.empty_cache()
    model = ContextTrainable(MODEL).cuda()
    tokens, legal, targets = history_tokens(training + validation)
    x, masks, labels = torch.tensor(tokens, device="cuda"), torch.tensor(legal, device="cuda"), torch.tensor(targets, device="cuda")
    ratings = torch.full((len(x),), data["elo"], dtype=torch.float32, device="cuda")
    teacher = logits_for(model, x, masks, ratings, np.arange(len(training)), 32).softmax(-1)
    actual, _ = fit(model, training, labels, teacher, x, masks, ratings, options, "baseline", lambda point: None)
    difference = max(float((value.detach().cpu() - expected_state[key]).abs().max())
                     for key, value in model.state_dict().items())
    assert actual["bestEpoch"] == expected["bestEpoch"]
    assert actual["updates"] == expected["updates"] == 6
    for left, right in zip(actual["history"], expected["history"], strict=True):
        for key in ["trainLoss", "trainAccuracy", "validationLoss", "validationAccuracy"]:
            assert abs(left[key] - right[key]) < 1e-6, (key, left, right)
    assert difference < 1e-7, difference
    print(json.dumps({"updates": actual["updates"], "selectedEpoch": actual["bestEpoch"],
                      "maximumParameterDifference": difference, "baselineParity": True}), flush=True)


if __name__ == "__main__":
    main()
