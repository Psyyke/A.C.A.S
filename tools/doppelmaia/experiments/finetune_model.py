# SPDX-License-Identifier: AGPL-3.0-only
# Architecture adapted from CSSLab/maia3 (see finetune_LICENSE.txt).
"""Differentiable, initializer-backed implementation of the shipped Maia3 graph.

Architecture cross-checked against CSSLab/maia3 models.py at
1e13597c42d4858b7cfd7cfdae01e297263364b2. The shipped wrapper repeats board
history and supplies fixed clocks; rounded FP16 constants are intentional.
"""

import copy
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper
import torch
from torch import nn
import torch.nn.functional as F


def float32_graph(path):
    graph = onnx.load(str(path))
    for tensor in graph.graph.initializer:
        if tensor.data_type == onnx.TensorProto.FLOAT16:
            tensor.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(tensor).astype(np.float32), tensor.name))
    for node in graph.graph.node:
        for attribute in node.attribute:
            if attribute.type == onnx.AttributeProto.TENSOR and attribute.t.data_type == onnx.TensorProto.FLOAT16:
                attribute.t.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(attribute.t).astype(np.float32)))
            if node.op_type == "Cast" and attribute.name == "to" and attribute.i == onnx.TensorProto.FLOAT16:
                attribute.i = onnx.TensorProto.FLOAT
    for value in list(graph.graph.input) + list(graph.graph.output) + list(graph.graph.value_info):
        if value.type.tensor_type.elem_type == onnx.TensorProto.FLOAT16:
            value.type.tensor_type.elem_type = onnx.TensorProto.FLOAT
    return graph


class Maia3(nn.Module):
    def __init__(self, path):
        super().__init__()
        self.graph = float32_graph(path)
        self.nodes = {node.name: node for node in self.graph.graph.node}
        self.initial = {item.name: numpy_helper.to_array(item).copy() for item in self.graph.graph.initializer}
        names = [name for name, value in self.initial.items()
                 if value.dtype == np.float32 and name.startswith(("model.", "onnx::MatMul"))]
        self.keys = {name: f"p{i}" for i, name in enumerate(names)}
        self.weights = nn.ParameterDict({self.keys[name]: nn.Parameter(torch.from_numpy(self.initial[name]))
                                         for name in names})
        self.register_buffer("clocks", torch.tensor([1.7998046875, 0.0200042724609375, 1.7998046875]), persistent=False)
        self.first_train_layer = 0

    def w(self, name):
        return self.weights[self.keys[name]]

    def linear(self, x, name):
        prefix = "/model/" + name
        if prefix + "/Gemm" in self.nodes:
            node = self.nodes[prefix + "/Gemm"]
            return F.linear(x, self.w(node.input[1]), self.w(node.input[2]))
        node = self.nodes[prefix + "/MatMul"]
        result = x @ self.w(node.input[1])
        add = self.nodes.get(prefix + "/Add")
        if add:
            bias = next(item for item in add.input if item in self.keys)
            result = result + self.w(bias)
        return result

    def ln(self, x, name):
        node = self.nodes["/model/" + name + "/LayerNormalization"]
        eps = next(a.f for a in node.attribute if a.name == "epsilon")
        return F.layer_norm(x, (x.shape[-1],), self.w(node.input[1]), self.w(node.input[2]), eps)

    @staticmethod
    def gelu(x):
        return x * 0.5 * (1 + torch.erf(x / 1.4140625))

    def block(self, x, index):
        p = f"transformer/layers.{index}/"
        y = self.linear(x, p + "self_attn/sm1").flatten(1)
        y = self.ln(self.gelu(self.linear(y, p + "self_attn/sm2")), p + "self_attn/ln1")
        y = self.ln(self.gelu(self.linear(y, p + "self_attn/sm3")), p + "self_attn/ln2")
        bias = (y.reshape(-1, 16, 128) @ self.w("model.gab_shared_weight").T).reshape(-1, 16, 64, 64)
        node = self.nodes["/model/" + p + "self_attn/mha/MatMul"]
        q, k, v = (x @ self.w(node.input[1])).chunk(3, -1)
        q, k, v = [t.reshape(-1, 64, 16, 32).transpose(1, 2) for t in (q, k, v)]
        attention = ((q * 0.42041015625) @ (k.transpose(-1, -2) * 0.42041015625) + bias).softmax(-1)
        y = (attention @ v).transpose(1, 2).reshape(-1, 64, 512)
        node = self.nodes["/model/" + p + "self_attn/mha/MatMul_3"]
        x = x + y @ self.w(node.input[1])
        x = x / torch.sqrt(x.square().mean(-1, keepdim=True) + 1.0132789611816406e-6)
        x = x * self.w(f"model.transformer.layers.{index}.norm1.weight")
        y = self.linear(self.gelu(self.linear(x, p + "linear1")), p + "linear2")
        x = x + y
        x = x / torch.sqrt(x.square().mean(-1, keepdim=True) + 1.0132789611816406e-6)
        return x * self.w(f"model.transformer.layers.{index}.norm2.weight")

    def embedding(self, tokens, elo_self, elo_oppo):
        def elo(values):
            ratio = values.clamp(0, 5000).reshape(-1, 1, 1) / 5000
            return (ratio * self.w("model.elo_embedding_low.weight")
                    + (1 - ratio) * self.w("model.elo_embedding_high.weight")).expand(-1, 64, -1)
        clocks = self.clocks.reshape(1, 1, 3).expand(tokens.shape[0], 64, -1)
        return self.linear(torch.cat([tokens.repeat(1, 1, 8), clocks, elo(elo_self), elo(elo_oppo)], -1),
                           "token_projection")

    def heads(self, x):
        x = self.ln(x, "transformer/norm")
        source, target = self.linear(x, "proj_sq_from"), self.linear(x, "proj_sq_to")
        scores = source @ target.transpose(1, 2) / 22.625
        promotion = self.linear(target[:, 56:64], "promo_bias_proj") * 22.625
        promotion = (scores[:, 48:56, 56:64, None] + promotion[:, None]).flatten(1)
        logits = torch.cat([scores.flatten(1), promotion], -1)
        pooled = self.ln(x.mean(1), "last_ln")
        value = self.linear(F.relu(self.linear(pooled, "fc_value_hid")), "fc_value")
        return logits, value, pooled

    def forward(self, tokens, elo_self, elo_oppo):
        x = self.embedding(tokens, elo_self, elo_oppo)
        for index in range(8):
            x = self.block(x, index)
        return self.heads(x)

    def configure(self, blocks):
        self.first_train_layer = 8 - blocks
        trained = set()
        for node in self.graph.graph.node:
            if any(f"/layers.{i}/" in node.name for i in range(8 - blocks, 8)) or any(
                    part in node.name for part in ["/proj_sq_from/", "/proj_sq_to/", "/promo_bias_proj/", "/transformer/norm/"]):
                trained.update(name for name in node.input if name in self.keys)
        if blocks == 8:
            trained = set(self.keys) - {name for name in self.keys if "fc_value" in name or "last_ln" in name}
        else:
            # GAB is shared by all blocks. Never update an initializer consumed
            # by a cached frozen prefix (including any graph-deduplicated weight).
            frozen = set()
            for node in self.graph.graph.node:
                if "/token_projection/" in node.name or any(
                        f"/layers.{i}/" in node.name for i in range(8 - blocks)):
                    frozen.update(node.input)
            trained.difference_update(frozen)
        for name, key in self.keys.items():
            self.weights[key].requires_grad_(name in trained)
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    def export(self, path: Path):
        graph = copy.deepcopy(self.graph)
        for tensor in graph.graph.initializer:
            if tensor.name in self.keys:
                tensor.CopyFrom(numpy_helper.from_array(self.w(tensor.name).detach().cpu().numpy(), tensor.name))
        onnx.checker.check_model(graph)
        onnx.save(graph, str(path))
