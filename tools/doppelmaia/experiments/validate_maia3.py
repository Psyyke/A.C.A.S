"""Independent NumPy/ONNX validation of browser-generated Maia 3 graphs."""

import argparse
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper


def promote_tensor(tensor: onnx.TensorProto) -> None:
    if tensor.data_type == onnx.TensorProto.FLOAT16:
        tensor.CopyFrom(numpy_helper.from_array(
            numpy_helper.to_array(tensor).astype(np.float32), tensor.name))


def float_base(path: Path) -> bytes:
    model = onnx.load(path)
    for tensor in model.graph.initializer:
        promote_tensor(tensor)
    for node in model.graph.node:
        for attribute in node.attribute:
            if node.op_type == "Cast" and attribute.name == "to" and attribute.i == 10:
                attribute.i = 1
            if attribute.HasField("t"):
                promote_tensor(attribute.t)
    for value in [*model.graph.input, *model.graph.output, *model.graph.value_info]:
        if value.type.tensor_type.elem_type == 10:
            value.type.tensor_type.elem_type = 1
    onnx.checker.check_model(model)
    return model.SerializeToString()


def infer(model: bytes | str, feeds: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    session = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    return dict(zip([output.name for output in session.get_outputs()], session.run(None, feeds)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=Path("app/assets/engines/Maia3/model/maia3_simplified.onnx"))
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--export", type=Path, required=True)
    args = parser.parse_args()
    tokens = np.zeros((2, 64, 12), dtype=np.float32)
    for file, piece in enumerate([3, 1, 2, 4, 5, 2, 1, 3]):
        tokens[:, file, piece] = 1
        tokens[:, 8 + file, 0] = 1
        tokens[:, 48 + file, 6] = 1
        tokens[:, 56 + file, piece + 6] = 1
    tokens[1, 12, 0] = 0
    tokens[1, 28, 0] = 1
    feeds = {"tokens": tokens, "elo_self": np.array([1500, 1700], dtype=np.float32),
             "elo_oppo": np.array([1500, 1300], dtype=np.float32)}
    for path in [args.features, args.export]:
        onnx.checker.check_model(onnx.load(path))
    reference = infer(float_base(args.base), feeds)
    features = infer(str(args.features), feeds)
    actual = infer(str(args.export), feeds)
    weights = {tensor.name: numpy_helper.to_array(tensor) for tensor in onnx.load(args.export).graph.initializer}
    expected = (features["acas_base_logits"]
                + features["acas_features"] @ weights["acas_adapter_weight"]
                + weights["acas_adapter_bias"])
    errors = {
        "float32_base_logit_max_error": float(np.max(np.abs(reference["logits_move"] - features["acas_base_logits"]))),
        "adapter_numpy_logit_max_error": float(np.max(np.abs(expected - actual["logits_move"]))),
        "unchanged_value_max_error": float(np.max(np.abs(reference["logits_value"] - actual["logits_value"]))),
    }
    if not all(np.isfinite(value) and value <= 0.0001 for value in errors.values()):
        raise ValueError(f"Native parity check failed: {errors}")
    print(json.dumps({"batch": 2, "providers": ort.get_available_providers(), **errors}, indent=2))


if __name__ == "__main__":
    main()
