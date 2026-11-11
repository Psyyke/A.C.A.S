# SPDX-License-Identifier: AGPL-3.0-only
"""Pinned upstream Maia 3 models and its causal, chronological history encoding."""

import argparse
import hashlib
import importlib
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import urllib.request

import chess
import numpy as np
import torch

from finetune_model import Maia3
from finetune_study import MODEL
from native_study import MOVES, encode


SOURCE_COMMIT = "1e13597c42d4858b7cfd7cfdae01e297263364b2"
RELEASES = {
    "23m": {
        "revision": "51a0145a8178046f7de23119160b136672deeb2b",
        "sha256": "bce6cd1af5f0399ac7eed33fabb7a6a2ef6193662c2740f262bf93af7bfb3569",
        "bytes": 91799307,
    },
    "79m": {
        "revision": "a107d6ceb7b298cb04ae1da4edffe2939858b894",
        "sha256": "3fc6181d5db789b45a15305732148757ae74efa3e0028e81ba335b462dac45c2",
        "bytes": 315651851,
    },
}


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_source(source):
    source = source.resolve()
    revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    changed = subprocess.check_output(
        ["git", "-C", str(source), "status", "--porcelain", "--untracked-files=no"], text=True).strip()
    if revision != SOURCE_COMMIT or changed:
        raise ValueError("Upstream Maia 3 must be the unmodified pinned source commit")
    return source


def prepare_weights(directory, size):
    spec = RELEASES[size]
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"maia3-{size}.pt"
    if not target.exists():
        url = (f"https://huggingface.co/UofTCSSLab/Maia3-{size.upper()}/resolve/"
               f'{spec["revision"]}/maia3-{size}.pt')
        pending = target.with_suffix(".pending.pt")
        with urllib.request.urlopen(url, timeout=120) as response, pending.open("wb") as stream:
            while chunk := response.read(8 * 1024 * 1024):
                stream.write(chunk)
        if pending.stat().st_size != spec["bytes"] or digest(pending) != spec["sha256"]:
            raise ValueError(f"{size} download does not match the published LFS identity")
        pending.replace(target)
    if target.stat().st_size != spec["bytes"] or digest(target) != spec["sha256"]:
        raise ValueError(f"{target} does not match the pinned public checkpoint")
    return target


def load_release(source, directory, size):
    source = verify_source(source)
    sys.path.insert(0, str(source))
    models = importlib.import_module("maia3.models")
    registry = importlib.import_module("maia3.model_registry")
    utils = importlib.import_module("maia3.utils")
    if Path(models.__file__).resolve().parent.parent != source:
        raise ValueError("A different Maia 3 package is already imported")
    if {move: index for index, move in enumerate(utils.get_all_possible_moves())} != MOVES:
        raise ValueError("Upstream move indices do not match the application's policy vocabulary")
    specification = next(item for item in registry.MODEL_SPECS if item.name == f"maia3-{size}")
    model = models.MAIA3Model(SimpleNamespace(**specification.config))
    path = directory / f"maia3-{size}.pt"
    if digest(path) != RELEASES[size]["sha256"]:
        raise ValueError(f"{size} checkpoint identity changed")
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    state = checkpoint["model_state_dict"] if "model_state_dict" in checkpoint else checkpoint
    state = {key.replace("smolgen", "gab"): value for key, value in state.items()}
    model.load_state_dict(state, strict=True)
    return model.eval()


def history_tokens(samples):
    current, legal, targets = encode(samples)
    result = np.empty((len(samples), 64, 96), np.float32)
    cache = {}
    for row, sample in enumerate(samples):
        history = sample.get("history")
        if not history or len(history) > 8 or history[0] != sample["fen"]:
            raise ValueError("Context research needs current-first, causal source history")
        frames = list(reversed(history))
        frames = [frames[0]] * (8 - len(frames)) + frames
        for index, fen in enumerate(frames):
            if fen not in cache:
                board = chess.Board(fen)
                canonical = board if board.turn else board.mirror()
                tokens = np.zeros((64, 12), np.float32)
                for square, piece in canonical.piece_map().items():
                    tokens[square, piece.piece_type - 1 + (0 if piece.color else 6)] = 1
                cache[fen] = tokens
            result[row, :, index * 12:(index + 1) * 12] = cache[fen]
    if not np.array_equal(result[:, :, -12:], current):
        raise AssertionError("The final history frame must match the application's current-board encoding")
    return result, legal, targets


class ShippedContext(Maia3):
    def embedding(self, tokens, elo_self, elo_oppo):
        if tokens.shape[-1] != 96:
            raise ValueError("Context model requires eight chronological board frames")

        def elo(values):
            ratio = values.clamp(0, 5000).reshape(-1, 1, 1) / 5000
            return (ratio * self.w("model.elo_embedding_low.weight")
                    + (1 - ratio) * self.w("model.elo_embedding_high.weight")).expand(-1, 64, -1)

        clocks = self.clocks.reshape(1, 1, 3).expand(tokens.shape[0], 64, -1)
        return self.linear(torch.cat([tokens, clocks, elo(elo_self), elo(elo_oppo)], -1), "token_projection")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("weights", type=Path)
    args = parser.parse_args()
    verify_source(args.source)
    for size in RELEASES:
        path = prepare_weights(args.weights, size)
        model = load_release(args.source, args.weights, size)
        print(f"{size} verified, {sum(parameter.numel() for parameter in model.parameters()):,} parameters, {path}", flush=True)


if __name__ == "__main__":
    main()
