# SPDX-License-Identifier: AGPL-3.0-only
"""Causal-history transformer adaptation with optional low-rank regularization."""

import copy
import time

import chess
import numpy as np
import onnx
from onnx import numpy_helper
import torch
from torch import nn
import torch.nn.functional as F

from context_models import ShippedContext, history_tokens
from native_data import position_key
from transformer_workflow import capture_step, epoch_order


class ContextTrainable(ShippedContext):
    def __init__(self, path, *, rank=0, blocks=8, history=True, seed=42):
        super().__init__(path)
        if rank < 0 or blocks not in range(1, 9):
            raise ValueError("Invalid transformer adaptation capacity")
        self.configure(blocks)
        self.rank, self.real_history = rank, history
        self.lora_left = nn.ParameterDict()
        self.lora_right = nn.ParameterDict()
        generator = torch.Generator().manual_seed(seed)
        if rank:
            for key, parameter in self.weights.items():
                if parameter.requires_grad and parameter.ndim == 2 and min(parameter.shape) > 1:
                    width = min(rank, *parameter.shape)
                    parameter.requires_grad_(False)
                    self.lora_left[key] = nn.Parameter(torch.randn(
                        parameter.shape[0], width, generator=generator) / np.sqrt(parameter.shape[0]))
                    self.lora_right[key] = nn.Parameter(torch.zeros(width, parameter.shape[1]))

    def w(self, name):
        key = self.keys[name]
        value = self.weights[key]
        if key in self.lora_left:
            value = value + self.lora_left[key] @ self.lora_right[key]
        return value

    def export(self, path):
        graph = copy.deepcopy(self.graph)
        for tensor in graph.graph.initializer:
            if tensor.name in self.keys:
                tensor.CopyFrom(numpy_helper.from_array(self.w(tensor.name).detach().cpu().numpy(), tensor.name))
        if self.real_history:
            tile = next(node for node in graph.graph.node if node.name == "/Tile" and node.op_type == "Tile")
            source, old = tile.input[0], tile.output[0]
            for node in graph.graph.node:
                for index, name in enumerate(node.input):
                    if name == old:
                        node.input[index] = source
            graph.graph.node.remove(tile)
            used = {name for node in graph.graph.node for name in node.input}
            unused = [tensor for tensor in graph.graph.initializer if tensor.name == tile.input[1] and tensor.name not in used]
            for tensor in unused:
                graph.graph.initializer.remove(tensor)
            for value in list(graph.graph.input) + list(graph.graph.value_info):
                if value.name in ["tokens", "tokens_cast_to_/Tile", "tokens_cast_to_/Shape"]:
                    value.type.tensor_type.shape.dim[2].dim_value = 96
            kept = [value for value in graph.graph.value_info if value.name != old]
            del graph.graph.value_info[:]
            graph.graph.value_info.extend(kept)
            property_ = graph.metadata_props.add()
            property_.key = "acas.maia3.history"
            property_.value = "8:oldest-first:per-frame-turn:earliest-padding"
        onnx.checker.check_model(graph)
        onnx.save(graph, str(path))


def fit_context(model, training, validation, elo, options, on_epoch=None):
    batch = options["batchSize"]
    if not training or not validation or batch < 1:
        raise ValueError("Training, validation and a positive batch size are required")
    samples = training + validation
    tokens, legal, targets = history_tokens(samples)
    if not model.real_history:
        tokens = np.tile(tokens[:, :, -12:], (1, 1, 8))
    x = torch.tensor(tokens, device="cuda")
    masks = torch.tensor(legal, device="cuda")
    labels = torch.tensor(targets, device="cuda")
    del tokens, legal
    ratings = torch.full((len(samples),), elo, dtype=torch.float32, device="cuda")
    seen = {position_key(chess.Board(sample["fen"])) for sample in training}
    novel = np.array([position_key(chess.Board(sample["fen"])) not in seen for sample in validation])
    if not novel.any():
        raise ValueError("No novel validation boards")
    validation_ids = np.flatnonzero(novel) + len(training)
    training_ids = np.arange(len(training))

    @torch.no_grad()
    def predict(indices):
        values = []
        for start in range(0, len(indices), batch):
            ids = indices[start:start + batch]
            values.append(model(x[ids], ratings[ids], ratings[ids])[0].masked_fill(~masks[ids], -1e9))
        return torch.cat(values)

    @torch.no_grad()
    def measure(indices):
        logits = predict(indices)
        return {"loss": float(F.cross_entropy(logits, labels[indices])),
                "accuracy": float((logits.argmax(-1) == labels[indices]).float().mean())}

    teacher = predict(training_ids).softmax(-1)
    soft_targets = options["baseAnchor"] * teacher
    soft_targets.scatter_add_(1, labels[:len(training)].reshape(-1, 1),
                             torch.full((len(training), 1), 1 - options["baseAnchor"],
                                        dtype=soft_targets.dtype, device="cuda"))
    del teacher
    direct = [parameter for parameter in model.weights.values() if parameter.requires_grad]
    low_rank = list(model.lora_left.parameters()) + list(model.lora_right.parameters())
    parameters = [parameter for parameter in model.parameters() if parameter.requires_grad]
    groups = [{"params": direct, "lr": options.get("directRate", options["learningRate"])}]
    if low_rank:
        groups.append({"params": low_rank, "lr": options["learningRate"]})
    optimizer = torch.optim.AdamW(groups, weight_decay=options.get("weightDecay", 0.01),
                                  foreach=False, capturable=True)
    replay = capture_step(model, optimizer, x, masks, soft_targets, ratings, batch, 1) if len(training) >= batch else None
    history = []
    best_loss, best_epoch, stale, updates = float("inf"), 0, 0, 0
    best = None
    started = time.perf_counter()
    for epoch in range(options["epochs"] + 1):
        if epoch:
            order = epoch_order(len(training), epoch, options.get("seed", 42))
            for start in range(0, len(order), batch):
                ids = torch.tensor(order[start:start + batch], device="cuda")
                if replay and len(ids) == batch:
                    loss, norm = replay(ids)
                else:
                    optimizer.zero_grad(set_to_none=False)
                    logits = model(x[ids], ratings[ids], ratings[ids])[0].masked_fill(~masks[ids], -1e9)
                    loss = -(soft_targets[ids] * logits.log_softmax(-1)).sum(-1).mean()
                    if not torch.isfinite(loss):
                        raise ValueError("Nonfinite contextual training objective")
                    loss.backward()
                    norm = torch.nn.utils.clip_grad_norm_(parameters, 1)
                    if not torch.isfinite(norm):
                        raise ValueError("Nonfinite contextual gradients")
                    optimizer.step()
                if not torch.isfinite(loss) or not torch.isfinite(norm):
                    raise ValueError("Nonfinite captured contextual update")
                updates += 1
        train, valid = measure(training_ids), measure(validation_ids)
        point = {"epoch": epoch, "trainLoss": train["loss"], "trainAccuracy": train["accuracy"],
                 "validationLoss": valid["loss"], "validationAccuracy": valid["accuracy"]}
        history.append(point)
        if on_epoch:
            on_epoch(point)
        if valid["loss"] < best_loss - 1e-5:
            best_loss, best_epoch, stale = valid["loss"], epoch, 0
            best = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        else:
            stale += 1
        if stale >= options["patience"]:
            break
    if best is None:
        raise AssertionError("The initial model was not checkpointed")
    model.load_state_dict(best)
    return {"options": options, "history": history, "bestEpoch": best_epoch,
        "exportedObjectiveLoss": best_loss, "updates": updates, "trainPositions": len(training),
        "validationPositions": len(validation), "novelValidationPositions": int(novel.sum()),
        "trainableParameters": sum(parameter.numel() for parameter in parameters),
        "trainableTensors": len(parameters), "seconds": time.perf_counter() - started,
        "exportedMetrics": measure(np.arange(len(training), len(samples)))}
