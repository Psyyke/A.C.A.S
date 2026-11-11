"""CUDA-only original Maia/convolutional Lc0 study against the shipped JS trainer."""

import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import time

import chess
import numpy as np
import onnx
import torch
import torch.nn.functional as F
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[3]
BRIDGE = Path(__file__).with_name("original_bridge.mjs")
MODELS = [f"maia-{rating}" for rating in [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2200]] + ["tinygyal-8"]


def bridge(*args):
    subprocess.run(["node", str(BRIDGE), *map(str, args)], cwd=ROOT, check=True)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def independent_planes(samples):
    planes = np.zeros((len(samples), 112, 8, 8), np.float32)
    for row, sample in enumerate(samples):
        black = chess.Board(sample["history"][0]).turn == chess.BLACK
        for step, fen in enumerate(sample["history"]):
            board = chess.Board(fen)
            for square, piece in board.piece_map().items():
                rank, file = divmod(square, 8)
                plane = step * 13 + piece.piece_type - 1 + (0 if piece.color != black else 6)
                planes[row, plane, 7 - rank if black else rank, file] = 1
            if sample["repetitions"][step]:
                planes[row, step * 13 + 12] = 1
        board = chess.Board(sample["history"][0])
        for offset, right in enumerate(["q", "k", "Q", "K"] if black else ["Q", "K", "q", "k"]):
            if right in sample["history"][0].split()[2]:
                planes[row, 104 + offset] = 1
        planes[row, 108] = black
        planes[row, 109] = board.halfmove_clock
        planes[row, 111] = 1
    return planes


def session(path):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.enable_profiling = True
    options.profile_file_prefix = str(path.parent / (path.stem + "-cuda-profile"))
    options.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
    runtime = ort.InferenceSession(str(path), sess_options=options,
                                  providers=[("CUDAExecutionProvider", {
                                      "use_tf32": 0, "cudnn_conv_algo_search": "HEURISTIC"})])
    if runtime.get_providers()[0] != "CUDAExecutionProvider":
        raise RuntimeError(f"CUDA required, got {runtime.get_providers()}")
    return runtime


def execution_proof(runtime):
    profile = Path(runtime.end_profiling())
    events = json.loads(profile.read_text())
    providers = Counter(event.get("args", {}).get("provider") for event in events
                        if event.get("args", {}).get("provider"))
    convolutions = sum(event.get("args", {}).get("op_name") in ["Conv", "FusedConv"]
                       and event.get("args", {}).get("provider") == "CUDAExecutionProvider" for event in events)
    if "CPUExecutionProvider" in providers or not convolutions:
        raise AssertionError(f"CUDA-only execution failed: {dict(providers)}")
    return {"providers": dict(providers), "cudaConvolutionEvents": convolutions, "profile": profile.name}


def tensors(features, indices, mapping):
    legal = torch.zeros((len(indices), 1858), dtype=torch.bool, device="cuda")
    targets = []
    for row, sample in enumerate(indices):
        legal[row, sample["legal"]] = True
        targets.append(sample["legal"][sample["target"]])
    return {"features": torch.tensor(features, device="cuda"), "legal": legal,
            "targets": torch.tensor(targets, device="cuda"),
            "mapping": torch.tensor(mapping, device="cuda")}


def logits(pack, matrix, bias):
    convolved = F.conv2d(pack["features"].to(matrix.dtype), matrix, bias, padding=1)
    return convolved.flatten(1)[:, pack["mapping"]].masked_fill(~pack["legal"], -1e9)


def metrics(pack, matrix, bias):
    with torch.no_grad():
        values = logits(pack, matrix, bias)
        return {"loss": float(F.cross_entropy(values, pack["targets"])),
                "accuracy": float((values.argmax(-1) == pack["targets"]).float().mean())}


def update(matrix, bias, base, velocity, batch, learning_rate, momentum_factor=.9, clip=5., decay=.0001):
    matrix.grad = None
    bias.grad = None
    F.cross_entropy(logits(batch, matrix, bias), batch["targets"]).backward()
    with torch.no_grad():
        norm = torch.sqrt(matrix.grad.double().square().sum() + bias.grad.double().square().sum())
        scale = min(1., clip / (float(norm) or 1.))
        for parameter, initial, momentum in zip([matrix, bias], base, velocity):
            derivative = parameter.grad.double() * scale + decay * (parameter.double() - initial.double())
            momentum.copy_((momentum_factor * momentum.double() + derivative).float())
            parameter.copy_((parameter.double() - learning_rate * momentum.double()).float().to(parameter.dtype))
    return float(norm), scale


def subset(pack, selected):
    return {key: value if key == "mapping" else value[selected] for key, value in pack.items()}


def fit(train, validation, initial_matrix, initial_bias, options, snapshot=None, optimizer=None):
    matrix = torch.tensor(initial_matrix, device="cuda", requires_grad=True)
    bias = torch.tensor(initial_bias, device="cuda", requires_grad=True)
    base = [matrix.detach().clone(), bias.detach().clone()]
    velocity = [torch.zeros_like(matrix, dtype=torch.float32), torch.zeros_like(bias, dtype=torch.float32)]
    best = [matrix.detach().clone(), bias.detach().clone()]
    history = []
    best_epoch, stale, state = 0, 0, 42
    clipping = []
    for epoch in range(options["epochs"] + 1):
        if epoch:
            order = list(range(len(train["targets"])))
            for i in range(len(order) - 1, 0, -1):
                state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
                j = state % (i + 1)
                order[i], order[j] = order[j], order[i]
            for start in range(0, len(order), options["batchSize"]):
                norm, scale = update(matrix, bias, base, velocity,
                                     subset(train, order[start:start + options["batchSize"]]), options["learningRate"],
                                     **(optimizer or {}))
                clipping.append({"norm": norm, "scale": scale})
                if snapshot:
                    snapshot(matrix, bias)
        measured, held = metrics(train, matrix, bias), metrics(validation, matrix, bias)
        history.append({"epoch": epoch, "trainLoss": measured["loss"], "trainAccuracy": measured["accuracy"],
                        "validationLoss": held["loss"], "validationAccuracy": held["accuracy"]})
        if not epoch:
            best_loss = held["loss"]
        elif held["loss"] < best_loss - .00001:
            best_loss, best_epoch, stale = held["loss"], epoch, 0
            best = [matrix.detach().clone(), bias.detach().clone()]
        else:
            stale += 1
            if stale >= options["patience"]:
                break
    return best[0], best[1], {"history": history, "bestEpoch": best_epoch,
                             "clippedBatches": sum(row["scale"] < 1 for row in clipping), "updates": clipping}


def fixture_parity(output):
    path = output / "js-fixture.json"
    bridge("fixture", "unused", path)
    fixture = json.loads(path.read_text())
    pack = tensors(np.array([row["features"] for row in fixture["samples"]], np.float64).reshape(-1, 2, 8, 8),
                   fixture["samples"], fixture["mapping"])
    # Actual JS multiplies and sums in double, with Float32Array stores at each gradient addition.
    initial = fixture["initial"]
    errors = []
    def snapshot(matrix, bias):
        expected = fixture["snapshots"][len(errors)]
        errors.append(max(float(np.max(np.abs(matrix.detach().cpu().numpy().ravel() - expected["matrix"]))),
                          float(np.max(np.abs(bias.detach().cpu().numpy() - expected["bias"])))))
    _, _, result = fit(pack, pack, np.array(initial["matrix"], np.float32).reshape(80, 2, 3, 3).astype(np.float64),
                       np.array(initial["bias"], np.float32).astype(np.float64), fixture["options"], snapshot)
    error = max(errors)
    tolerance = 2e-6
    sensitivity = {}
    for label, optimizer in [("withoutMomentum", {"momentum_factor": 0.}),
                             ("withoutClip", {"clip": float("inf")}), ("withoutBaseDecay", {"decay": 0.})]:
        mutations = []
        def altered(matrix, bias):
            expected = fixture["snapshots"][len(mutations)]
            mutations.append(max(float(np.max(np.abs(matrix.detach().cpu().numpy().ravel() - expected["matrix"]))),
                                 float(np.max(np.abs(bias.detach().cpu().numpy() - expected["bias"])))))
        fit(pack, pack, np.array(initial["matrix"], np.float32).reshape(80, 2, 3, 3).astype(np.float64),
            np.array(initial["bias"], np.float32).astype(np.float64), fixture["options"], altered, optimizer)
        sensitivity[label] = max(mutations)
    if error > tolerance or not result["clippedBatches"] or min(sensitivity.values()) <= tolerance:
        raise AssertionError(f"Actual JS multi-update parity failed: {error}")
    return {"updates": len(errors), "maximumWeightError": error, "tolerance": tolerance,
            "clippedBatches": result["clippedBatches"], "momentum": .9, "clipNorm": 5,
            "baseWeightDecay": .0001, "mutationErrors": sensitivity,
            "reference": "unmodified learning.js trainPolicy, every batch"}


def study_model(name, output, samples, indices, planes, options, split_sizes=(256, 64, 128)):
    started = time.perf_counter()
    train_end, validation_end = split_sizes[0], split_sizes[0] + split_sizes[1]
    reference_indices = [0, train_end, validation_end]
    directory = output / name
    source = ROOT / "app" / "assets" / "lc0-nets" / (name + ".pb")
    if not (directory / "metadata.json").exists() or json.loads(
            (directory / "metadata.json").read_text()).get("sourceSha256") != sha(source):
        bridge("prepare", source, directory)
    meta = json.loads((directory / "metadata.json").read_text())
    for path in [directory / "model.onnx", directory / "features.onnx"]:
        onnx.checker.check_model(str(path))
    extractor = session(directory / "features.onnx")
    extract_start = time.perf_counter()
    features = np.concatenate([extractor.run([meta["output"]], {"/input/planes": planes[start:start + 32]})[0]
                               for start in range(0, len(planes), 32)])
    feature_seconds = time.perf_counter() - extract_start
    extraction_proof = execution_proof(extractor)
    del extractor
    features.astype(np.float32).tofile(directory / "cache.f32")
    initial_matrix = np.fromfile(directory / "matrix.f32", np.float32).reshape(80, meta["channels"], 3, 3)
    initial_bias = np.fromfile(directory / "bias.f32", np.float32)
    packs = [tensors(features[a:b], indices[a:b], meta["mapping"])
             for a, b in [(0, train_end), (train_end, validation_end), (validation_end, len(samples))]]
    matrix = torch.tensor(initial_matrix, device="cuda")
    bias = torch.tensor(initial_bias, device="cuda")
    baseline = [metrics(pack, matrix, bias) for pack in packs]
    original = session(directory / "model.onnx")
    original_logits = original.run(["/output/policy"], {"/input/planes": planes[[0, 1, 2, train_end, validation_end]]})[0]
    original_proof = execution_proof(original)
    del original
    request = {"matrix": str(directory / "matrix.f32"), "bias": str(directory / "bias.f32"),
               "features": str(directory / "cache.f32"), "channels": meta["channels"],
               "mapping": meta["mapping"], "samples": indices[:3]}
    (directory / "js-request.json").write_text(json.dumps(request))
    bridge("reference", directory / "js-request.json", directory / "js-reference.json")
    js = json.loads((directory / "js-reference.json").read_text())
    full_error = max(abs(original_logits[row, index] - js[row]["logits"][j])
                     for row in range(3) for j, index in enumerate(indices[row]["legal"]))
    request = {"model": str(directory / "model.onnx"), "featureModel": str(directory / "features.onnx"),
               "outputName": meta["output"], "samples": [samples[i] for i in reference_indices]}
    (directory / "browser-request.json").write_text(json.dumps(request))
    bridge("browser-reference", directory / "browser-request.json", directory / "browser-reference.json")
    browser = json.loads((directory / "browser-reference.json").read_text())
    browser_feature_error = max(float(np.max(np.abs(features[index].ravel() - browser[row]["features"])))
                                for row, index in enumerate(reference_indices))
    browser_logit_error = max(float(np.max(np.abs(original_logits[native] - browser[reference]["logits"])))
                              for native, reference in [(0, 0), (3, 1), (4, 2)])
    if full_error > .003 or browser_logit_error > .003 or browser_feature_error > .003:
        raise AssertionError(f"{name} parity failed: {full_error}, {browser_logit_error}, {browser_feature_error}")
    train_started = time.perf_counter()
    last = []
    def remember_last(matrix, bias):
        last[:] = [matrix.detach().clone(), bias.detach().clone()]
    trained_matrix, trained_bias, result = fit(packs[0], packs[1], initial_matrix, initial_bias, options, remember_last)
    torch.cuda.synchronize()
    train_seconds = time.perf_counter() - train_started
    request = {"matrix": str(directory / "matrix.f32"), "bias": str(directory / "bias.f32"),
               "features": str(directory / "cache.f32"), "channels": meta["channels"],
               "mapping": meta["mapping"], "samples": indices[:validation_end], "options": options,
               "trainCount": split_sizes[0], "validationCount": split_sizes[1]}
    (directory / "js-training-request.json").write_text(json.dumps(request))
    bridge("train-reference", directory / "js-training-request.json", directory / "js-training.json")
    js_training = json.loads((directory / "js-training.json").read_text())
    js_weights = np.fromfile(directory / "js-training.json.f32", np.float32)
    native_weights = np.concatenate([trained_matrix.cpu().numpy().ravel(), trained_bias.cpu().numpy()])
    training_weight_error = float(np.max(np.abs(js_weights - native_weights)))
    last_weights = np.concatenate([last[0].cpu().numpy().ravel(), last[1].cpu().numpy()])
    last_weight_error = float(np.max(np.abs(np.fromfile(directory / "js-training.json.last.f32", np.float32) - last_weights)))
    if len(js_training["history"]) != len(result["history"]) or js_training["bestEpoch"] != result["bestEpoch"]:
        raise AssertionError("CUDA and JS checkpoint selection differed")
    training_metric_error = max(abs(a[key] - b[key]) for a, b in zip(js_training["history"], result["history"])
                                for key in ["trainLoss", "validationLoss", "trainAccuracy", "validationAccuracy"])
    if max(training_weight_error, last_weight_error) > 2e-5 or training_metric_error > .0003:
        raise AssertionError(f"Real-data JS training parity failed: {training_weight_error}, {last_weight_error}, {training_metric_error}")
    last_weights.tofile(directory / "last-epoch.f32")
    candidate = directory / "candidate"
    bridge("export", source, candidate, directory / "last-epoch.f32")
    onnx.checker.check_model(str(candidate / "model.onnx"))
    candidate_matrix = torch.tensor(np.fromfile(candidate / "matrix.f32", np.float32).reshape(initial_matrix.shape), device="cuda")
    candidate_bias = torch.tensor(np.fromfile(candidate / "bias.f32", np.float32), device="cuda")
    candidate_runtime = session(candidate / "model.onnx")
    candidate_actual = candidate_runtime.run(["/output/policy"], {"/input/planes": planes[train_end:train_end + 3]})[0]
    candidate_proof = execution_proof(candidate_runtime)
    candidate_expected = logits(subset(packs[1], [0, 1, 2]), candidate_matrix, candidate_bias).cpu().numpy()
    candidate_error = max(abs(candidate_actual[row, index] - candidate_expected[row, index])
                          for row in range(3) for index in indices[train_end + row]["legal"])
    if candidate_error > .003 or sha(candidate / "weights.pb") == sha(source):
        raise AssertionError(f"Changed trained candidate export failed: {candidate_error}")
    candidate_validation = metrics(packs[1], candidate_matrix, candidate_bias)
    del candidate_runtime
    np.concatenate([trained_matrix.cpu().numpy().ravel(), trained_bias.cpu().numpy()]).tofile(directory / "trained.f32")
    export = directory / "export"
    bridge("export", source, export, directory / "trained.f32")
    quant_matrix = torch.tensor(np.fromfile(export / "matrix.f32", np.float32).reshape(initial_matrix.shape), device="cuda")
    quant_bias = torch.tensor(np.fromfile(export / "bias.f32", np.float32), device="cuda")
    quantized = [metrics(pack, quant_matrix, quant_bias) for pack in packs]
    retained = result["bestEpoch"] > 0 and quantized[1]["loss"] < baseline[1]["loss"]
    if not retained:
        # Match the browser's quantized-validation gate exactly.
        bridge("prepare", source, export)
        quant_matrix, quant_bias = matrix, bias
        quantized = baseline
    onnx.checker.check_model(str(export / "model.onnx"))
    exported_runtime = session(export / "model.onnx")
    test_indices = reference_indices
    verified = exported_runtime.run(["/output/policy"], {"/input/planes": planes[test_indices]})[0]
    export_proof = execution_proof(exported_runtime)
    expected = logits(tensors(features[test_indices], [indices[i] for i in test_indices], meta["mapping"]), quant_matrix, quant_bias).cpu().numpy()
    export_error = max(abs(verified[row, index] - expected[row, index])
                       for row, i in enumerate(test_indices) for index in indices[i]["legal"])
    if export_error > .003:
        raise AssertionError(f"Exported PB/ONNX parity failed: {export_error}")
    del exported_runtime
    with torch.no_grad():
        before = logits(packs[2], matrix, bias).cpu().numpy()
        after = logits(packs[2], quant_matrix, quant_bias).cpu().numpy()
    with (directory / "test-predictions.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["gameId", "ply", "target", "before", "after"])
        for row, sample in enumerate(samples[validation_end:]):
            legal = indices[validation_end + row]["legal"]
            writer.writerow([sample["gameId"], sample["ply"], sample["move"],
                             sample["legalMoves"][legal.index(int(before[row].argmax()))],
                             sample["legalMoves"][legal.index(int(after[row].argmax()))]])
    report = {"model": name, "sourceSha256": sha(source), "exportSha256": sha(export / "weights.pb"),
              "channels": meta["channels"], "baseline": dict(zip(["train", "validation", "test"], baseline)),
              "exported": dict(zip(["train", "validation", "test"], quantized)),
              "retained": retained, "bestEpoch": result["bestEpoch"] if retained else 0,
              "candidate": {"lastEpochValidation": candidate_validation, "changedHead": True,
                            "pbSha256": sha(candidate / "weights.pb"), "onnxParity": float(candidate_error),
                            "warning": "Diagnostic last-epoch candidate, not validation-selected; do not deploy."},
              "cudaExecution": {"features": extraction_proof, "original": original_proof,
                                "candidate": candidate_proof, "export": export_proof},
              "history": result["history"], "clippedBatches": result["clippedBatches"],
              "seconds": {"features": feature_seconds, "training": train_seconds, "total": time.perf_counter() - started},
              "parity": {"cudaFeaturesVsBrowserWasm": browser_feature_error,
                         "cudaLogitsVsBrowserWasm": browser_logit_error,
                         "jsPolicyVsCudaOnnx": float(full_error), "exportedPbOnnx": float(export_error),
                         "completeJsTrainingWeights": training_weight_error,
                         "lastUpdatedJsTrainingWeights": last_weight_error,
                         "completeJsTrainingMetrics": training_metric_error},
              "export": str((export / "weights.pb").relative_to(ROOT))}
    (directory / "report.json").write_text(json.dumps(report, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "temp" / "doppelmaia-original-comparison")
    parser.add_argument("--models", nargs="+", default=MODELS)
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is mandatory; no CPU fallback")
    torch.set_num_threads(4)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.backends.cudnn.deterministic = True
    ort.preload_dlls()
    dataset = json.loads((output / "dataset.json").read_text())
    samples = [row for key in ["train", "validation", "test"] for row in dataset["splits"][key]]
    indices = json.loads((output / "indices.json").read_text())
    planes = np.fromfile(output / "planes.f32", np.float32).reshape(-1, 112, 8, 8)
    if not np.array_equal(planes, independent_planes(samples)):
        raise AssertionError("Independent Python encoding differs from actual JS encoding")
    options = {"epochs": args.epochs, "batchSize": 16, "learningRate": .005, "patience": 3}
    report = {"device": torch.cuda.get_device_name(), "torch": torch.__version__, "onnxruntime": ort.__version__,
              "python": platform.python_version(), "cudaRequired": True, "cpuFallback": False,
              "datasetSha256": sha(output / "dataset.json"), "samplesSha256": dataset["samplesSha256"],
              "splitPositions": {key: len(rows) for key, rows in dataset["splits"].items()},
              "options": options, "encodingParity": f"all {len(samples)} real history8 samples exactly equal",
              "player": dataset.get("player"), "medianRating": dataset.get("medianRating"),
              "optimizerParity": fixture_parity(output), "models": [],
              "limitations": [("Single-player study; one player cannot establish general style transfer."
                               if dataset.get("player") else "Pooled human games, not single-player imitation."),
                              f"Only {len(dataset['splits']['test'])} held-out moves: noisy estimates, no strength claim.",
                              "Only final policy convolution is trained; neural tower and value head remain frozen.",
                              "Browser WASM is a reference; training and feature extraction here require native CUDA.",
                              "Browser inference parity uses three positions per model; optimizer parity uses a 12-update stress fixture.",
                              "No expectation of near-100% human agreement. Hyperparameters fixed, test set never used for selection."]}
    for name in args.models:
        result = study_model(name, output, samples, indices, planes, options,
                             tuple(len(dataset["splits"][key]) for key in ["train", "validation", "test"]))
        report["models"].append(result)
        (output / "report.json").write_text(json.dumps(report, indent=2))
        print(json.dumps({"model": name, "before": result["baseline"]["test"],
                          "after": result["exported"]["test"], "seconds": result["seconds"]}), flush=True)


if __name__ == "__main__":
    main()
