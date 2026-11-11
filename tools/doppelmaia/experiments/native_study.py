"""Native CUDA study of rating transfer, human imitation and base anchoring."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import time

import chess
import chess.engine
import numpy as np
import onnxruntime as ort
import torch
import torch.nn.functional as functional

from native_data import position_key

ROOT = Path(__file__).resolve().parents[3]
BRIDGE = Path(__file__).with_name("native_bridge.mjs")
MOVES = json.loads((ROOT / "app/assets/engines/Maia3/data/all_moves_maia3.json").read_text())
WIDTH = 4352
TRAITS = ["knight", "pawn", "capture", "check", "castle"]


def canonical_move(move: str, black: bool) -> str:
    if not black:
        return move
    return move[0] + str(9 - int(move[1])) + move[2] + str(9 - int(move[3])) + move[4:]


def encode(samples: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    tokens = np.zeros((len(samples), 64, 12), dtype=np.float32)
    legal = np.zeros((len(samples), WIDTH), dtype=bool)
    targets = np.empty(len(samples), dtype=np.int64)
    for row, sample in enumerate(samples):
        board = chess.Board(sample["fen"])
        black = not board.turn
        canonical = board if board.turn else board.mirror()
        for square, piece in canonical.piece_map().items():
            tokens[row, square, piece.piece_type - 1 + (0 if piece.color else 6)] = 1
        indices = [MOVES[canonical_move(move, black)] for move in sample["legalMoves"]]
        legal[row, indices] = True
        targets[row] = MOVES[canonical_move(sample["move"], black)]
        complete = {move.uci() for move in board.legal_moves}
        if not legal[row, targets[row]] or len(indices) != len(complete) or set(sample["legalMoves"]) != complete:
            raise ValueError("Invalid native study move encoding")
    return tokens, legal, targets


def feeds(tokens: np.ndarray, elo: int) -> dict:
    ratings = np.full(len(tokens), elo, dtype=np.float32)
    return {"tokens": tokens, "elo_self": ratings, "elo_oppo": ratings.copy()}


def session(path: Path, gpu: bool, profile: Path | None = None) -> ort.InferenceSession:
    options = ort.SessionOptions()
    options.intra_op_num_threads = 8
    options.inter_op_num_threads = 1
    if profile:
        options.enable_profiling = True
        options.profile_file_prefix = str(profile)
    providers = [("CUDAExecutionProvider", {"use_tf32": 0, "cudnn_conv_algo_search": "HEURISTIC"})] if gpu else ["CPUExecutionProvider"]
    result = ort.InferenceSession(str(path), sess_options=options, providers=providers)
    if gpu and result.get_providers()[0] != "CUDAExecutionProvider":
        raise RuntimeError("CUDA ONNX provider did not initialize")
    return result


def extract(runtime: ort.InferenceSession, tokens: np.ndarray, elo: int, batch: int) -> tuple[np.ndarray, np.ndarray]:
    feature_rows, logit_rows = [], []
    for start in range(0, len(tokens), batch):
        base, features = runtime.run(["acas_base_logits", "acas_features"], feeds(tokens[start:start + batch], elo))
        if not np.isfinite(base).all() or not np.isfinite(features).all():
            raise ValueError("Nonfinite native inference")
        feature_rows.append(features)
        logit_rows.append(base)
    return np.concatenate(feature_rows), np.concatenate(logit_rows)


def torch_pack(features: np.ndarray, base: np.ndarray, legal: np.ndarray, targets: np.ndarray, device: str) -> dict:
    return {"features": torch.tensor(features, device=device), "base": torch.tensor(base, device=device),
            "legal": torch.tensor(legal, device=device), "targets": torch.tensor(targets, device=device)}


def logits(pack: dict, matrix: torch.Tensor, bias: torch.Tensor) -> torch.Tensor:
    return (pack["base"] + pack["features"] @ matrix + bias).masked_fill(~pack["legal"], -1e9)


def fit(train: dict, validation: dict, anchor: float, epochs: int = 40,
        random_labels: bool = False, learning_rate: float = 0.02,
        optimizer_name: str = "sgd", seed: int = 42,
        soft_targets: torch.Tensor | None = None,
        validation_targets: torch.Tensor | None = None) -> tuple[np.ndarray, np.ndarray, dict]:
    device = train["features"].device
    matrix = torch.zeros((train["features"].shape[1], WIDTH), device=device, requires_grad=True)
    bias = torch.zeros(WIDTH, device=device, requires_grad=True)
    if optimizer_name == "sgd":
        optimizer = torch.optim.SGD([matrix, bias], lr=learning_rate, momentum=0.9, weight_decay=0.0001)
    elif optimizer_name == "adam":
        optimizer = torch.optim.Adam([matrix, bias], lr=learning_rate, weight_decay=0.0001)
    else:
        raise ValueError(f"Unknown optimizer {optimizer_name}")
    with torch.no_grad():
        teacher = train["base"].masked_fill(~train["legal"], -1e9).softmax(-1)
        target = functional.one_hot(train["targets"], WIDTH).float()
        if random_labels:
            generator = torch.Generator(device=device).manual_seed(77123)
            sampled = torch.multinomial(train["legal"].float(), 1, generator=generator).squeeze(1)
            target = functional.one_hot(sampled, WIDTH).float()
        target = (1 - anchor) * target + anchor * teacher
        if soft_targets is not None:
            if anchor or random_labels or soft_targets.shape != target.shape or not torch.isfinite(soft_targets).all():
                raise ValueError("Invalid native soft target configuration")
            target = soft_targets
    def validation_loss_at_current_weights():
        values = logits(validation, matrix, bias)
        if validation_targets is None:
            return functional.cross_entropy(values, validation["targets"])
        if validation_targets.shape != values.shape or not torch.isfinite(validation_targets).all():
            raise ValueError("Invalid validation soft targets")
        return -(validation_targets * functional.log_softmax(values, -1)).sum(-1).mean()
    best_loss = float(validation_loss_at_current_weights().detach())
    best = (matrix.detach().clone(), bias.detach().clone())
    history = [{"epoch": 0, "validationLoss": best_loss}]
    best_epoch, stale, state = 0, 0, seed
    started = time.perf_counter()
    for epoch in range(1, epochs + 1):
        order = list(range(len(train["targets"])))
        # Match the browser's LCG and Fisher Yates ordering.
        for i in range(len(order) - 1, 0, -1):
            state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
            j = state % (i + 1)
            order[i], order[j] = order[j], order[i]
        indices = torch.tensor(order, device=device)
        for batch in indices.split(32):
            selected = {key: value[batch] for key, value in train.items()}
            optimizer.zero_grad(set_to_none=True)
            loss = -(target[batch] * functional.log_softmax(logits(selected, matrix, bias), -1)).sum(-1).mean()
            if not torch.isfinite(loss):
                raise ValueError("Native training diverged")
            loss.backward()
            optimizer.step()
        with torch.no_grad():
            validation_loss = float(validation_loss_at_current_weights())
            train_loss = float(functional.cross_entropy(logits(train, matrix, bias), train["targets"]))
        history.append({"epoch": epoch, "trainLoss": train_loss, "validationLoss": validation_loss})
        if validation_loss < best_loss - 0.00001:
            best_loss, best_epoch, stale = validation_loss, epoch, 0
            best = (matrix.detach().clone(), bias.detach().clone())
        else:
            stale += 1
            if stale >= 8:
                break
    torch.cuda.synchronize() if device.type == "cuda" else None
    return best[0].cpu().numpy(), best[1].cpu().numpy(), {
        "anchor": anchor, "randomLabels": random_labels, "bestEpoch": best_epoch,
        "optimizer": optimizer_name, "learningRate": learning_rate, "seed": seed,
        "trainingSeconds": time.perf_counter() - started, "history": history}


def probabilities(features: np.ndarray, base: np.ndarray, legal: np.ndarray,
                  matrix: np.ndarray, bias: np.ndarray, scale: float = 1) -> np.ndarray:
    values = base + scale * (features @ matrix + bias)
    values = np.where(legal, values, -1e9)
    values -= values.max(axis=1, keepdims=True)
    exponential = np.exp(values)
    return exponential / exponential.sum(axis=1, keepdims=True)


def paired_interval(samples: list[dict], difference: np.ndarray) -> dict:
    groups = {}
    for index, sample in enumerate(samples):
        groups.setdefault(sample["gameId"], []).append(index)
    sums = np.array([difference[indices].sum() for indices in groups.values()])
    sizes = np.array([len(indices) for indices in groups.values()])
    random = np.random.default_rng(42)
    draws = random.integers(len(sizes), size=(2000, len(sizes)))
    values = sums[draws].sum(1) / sizes[draws].sum(1)
    low, high = np.quantile(values, [0.025, 0.975])
    return {"mean": float(difference.mean()), "low": float(low), "high": float(high),
            "games": len(sizes), "method": "2000 paired whole game bootstrap draws"}


def metrics(samples: list[dict], probs: np.ndarray, targets: np.ndarray) -> tuple[dict, list[dict]]:
    rows = []
    predicted_traits, actual_traits = np.zeros(len(TRAITS)), np.zeros(len(TRAITS))
    for i, sample in enumerate(samples):
        board = chess.Board(sample["fen"])
        black = not board.turn
        prediction = int(probs[i].argmax())
        masses = np.zeros(len(TRAITS))
        observed = np.zeros(len(TRAITS))
        chosen = None
        for uci in sample["legalMoves"]:
            move = chess.Move.from_uci(uci)
            index = MOVES[canonical_move(uci, black)]
            trait = np.array([board.piece_type_at(move.from_square) == chess.KNIGHT,
                              board.piece_type_at(move.from_square) == chess.PAWN,
                              board.is_capture(move), board.gives_check(move), board.is_castling(move)], dtype=float)
            masses += probs[i, index] * trait
            if index == targets[i]:
                observed = trait
            if index == prediction:
                chosen = uci
        if chosen is None:
            raise ValueError("Native policy selected an illegal move")
        predicted_traits += masses
        actual_traits += observed
        rows.append({"gameId": sample["gameId"], "fen": sample["fen"], "observed": sample["move"],
                     "chosen": chosen, "crossEntropy": float(-np.log(max(float(probs[i, targets[i]]), 1e-30))),
                     "moveMatch": prediction == targets[i],
                     **dict(zip(TRAITS, map(float, masses)))})
    n = len(samples)
    predicted_traits /= n
    actual_traits /= n
    return {"positions": n, "games": len({sample["gameId"] for sample in samples}),
            "crossEntropy": float(np.mean([row["crossEntropy"] for row in rows])),
            "moveMatch": float(np.mean([row["moveMatch"] for row in rows])),
            "traitMeanAbsoluteError": float(np.abs(predicted_traits - actual_traits).mean()),
            "predictedTraits": dict(zip(TRAITS, map(float, predicted_traits))),
            "observedTraits": dict(zip(TRAITS, map(float, actual_traits)))}, rows


def score_position(task: tuple[str, str, int, str]) -> dict:
    executable, fen, nodes, engine_hash = task
    board = chess.Board(fen)
    with chess.engine.SimpleEngine.popen_uci(executable) as engine:
        engine.configure({"Threads": 1, "Hash": 32})
        infos = engine.analyse(board, chess.engine.Limit(nodes=nodes), multipv=board.legal_moves.count())
    scores = {info["pv"][0].uci(): info["score"].pov(board.turn).score(mate_score=10000)
              for info in infos if info.get("pv")}
    if set(scores) != {move.uci() for move in board.legal_moves}:
        raise ValueError("Stockfish did not return every legal root move")
    best = max(scores.values())
    return {"fen": fen, "losses": {move: min(1000, max(0, best - score)) for move, score in scores.items()},
            "minimumDepth": min(info.get("depth", 0) for info in infos), "nodesBudget": nodes,
            "engineSHA256": engine_hash}


def check_gradient(output: Path) -> float:
    samples = [{"features": [0.25] * 64, "base": [0.2, -0.5], "legal": [1, 200],
                "target": 1, "targets": [0, 1]},
               {"features": [-0.125] * 64, "base": [-1, 2], "legal": [3, 400],
                "target": 0, "targets": [1, 0]}]
    fixture = output / "gradient-fixture.json"
    expected = output / "browser-gradient.bin"
    features = np.array([sample["features"] for sample in samples], dtype=np.float32)
    base = np.zeros((2, WIDTH), np.float32)
    legal = np.zeros((2, WIDTH), bool)
    for i, sample in enumerate(samples):
        base[i, sample["legal"]] = sample["base"]
        legal[i, sample["legal"]] = True
    errors = []
    for anchor in [0, 0.5, 0.8]:
        target_matrix = np.zeros((2, WIDTH), np.float32)
        for i, sample in enumerate(samples):
            teacher = np.exp(np.array(sample["base"]) - max(sample["base"]))
            teacher /= teacher.sum()
            sample["targets"] = [float(anchor * teacher[j] + (1 - anchor) * (j == sample["target"]))
                                 for j in range(len(teacher))]
            target_matrix[i, sample["legal"]] = sample["targets"]
        fixture.write_text(json.dumps({"samples": samples, "learningRate": 0.02}))
        subprocess.run(["node", str(BRIDGE), "step", str(fixture), str(expected)], check=True)
        for device in ["cpu", "cuda"]:
            matrix = torch.zeros((64, WIDTH), device=device, requires_grad=True)
            bias = torch.zeros(WIDTH, device=device, requires_grad=True)
            optimizer = torch.optim.SGD([matrix, bias], lr=0.02, momentum=0.9, weight_decay=0.0001)
            pack = torch_pack(features, base, legal, np.array([200, 3]), device)
            loss = -(torch.tensor(target_matrix, device=device) * logits(pack, matrix, bias).log_softmax(-1)).sum(-1).mean()
            loss.backward()
            optimizer.step()
            actual = np.concatenate([matrix.detach().cpu().numpy().ravel(), bias.detach().cpu().numpy()])
            errors.append(float(np.max(np.abs(actual - np.fromfile(expected, dtype="<f4")))))
    error = max(errors)
    if error > 2e-6:
        raise ValueError(f"Native CPU or CUDA gradient differs from browser by {error}")
    return error


def verify_export(prepared: Path, output: Path, matrix: np.ndarray, bias: np.ndarray,
                  tokens: np.ndarray, features: dict, bases: dict) -> dict:
    binary = output.with_suffix(".bin")
    np.concatenate([matrix.ravel(), bias]).astype("<f4").tofile(binary)
    subprocess.run(["node", str(BRIDGE), "export", str(prepared), str(output), str(binary)], check=True)
    runtime = session(output, True)
    error = 0
    for elo in [1000, 1500, 2000, 2400]:
        actual = runtime.run(["logits_move"], feeds(tokens[:4], elo))[0]
        expected = bases[elo][:4] + features[elo][:4] @ matrix + bias
        error = max(error, float(np.max(np.abs(actual - expected))))
    if error > 0.001:
        raise ValueError(f"Export parity failed with {error}")
    return {"maximumLogitError": error, "ratings": [1000, 1500, 2000, 2400], "bytes": output.stat().st_size}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--human", type=Path, required=True)
    parser.add_argument("--synthetic", type=Path, default=ROOT / "temp/doppelmaia-style-study")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stockfish", type=Path, required=True)
    parser.add_argument("--quality-positions", type=int, default=80)
    parser.add_argument("--quality-nodes", type=int, default=500000)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    if args.quality_positions < 1 or args.quality_nodes < 1 or not 1 <= args.workers <= 16:
        parser.error("Use positive quality budgets and one to sixteen workers")
    args.output.mkdir(parents=True, exist_ok=True)
    engine_hash = hashlib.sha256(args.stockfish.read_bytes()).hexdigest()
    with chess.engine.SimpleEngine.popen_uci(str(args.stockfish.resolve())) as engine:
        engine_identity = engine.id
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
    torch.backends.cuda.matmul.allow_tf32 = False
    if not torch.cuda.is_available():
        raise RuntimeError("This study requires real CUDA, not a CPU fallback")
    ort.preload_dlls()
    started = time.perf_counter()
    gradient_error = check_gradient(args.output)
    prepared = args.output / "maia3-features.onnx"
    source = ROOT / "app/assets/engines/Maia3/model/maia3_simplified.onnx"
    if not prepared.exists():
        subprocess.run(["node", str(BRIDGE), "prepare", str(source), str(prepared)], check=True)
    cpu = session(prepared, False)
    gpu = session(prepared, True, args.output / "cuda-profile")
    human = json.loads(args.human.read_text())
    players = human["players"]
    probe, _, _ = encode(players[0]["splits"]["train"]["samples"][:4])
    extract(gpu, probe, 1500, 4)
    profile_path = Path(gpu.end_profiling())
    providers = {}
    for event in json.loads(profile_path.read_text()):
        provider = event.get("args", {}).get("provider")
        if provider:
            providers[provider] = providers.get(provider, 0) + 1
    profile_path.unlink()
    if not providers.get("CUDAExecutionProvider"):
        raise RuntimeError("No actual CUDA kernels were recorded")
    synthetic = json.loads((args.synthetic / "knightfan-dataset.json").read_text())
    synthetic["test"] = json.loads((args.synthetic / "knightfan-test.json").read_text())
    players.append({"name": "KnightFan", "medianRating": None, "sourceGames": None,
                    "splits": {key: synthetic[key] for key in ["train", "validation", "test"]}})
    report = {"hardware": {"gpu": torch.cuda.get_device_name(), "torch": torch.__version__,
                           "ort": ort.__version__, "cpuThreads": 8, "parserAndEngineWorkers": args.workers},
              "protocol": {"ratings": [1000, 1500, 2000, 2400], "epochs": 40, "learningRate": 0.02,
                           "batchSize": 32, "patience": 8, "anchors": [0, 0.5, 0.8],
                           "qualityPositionsPerPlayer": args.quality_positions, "qualityNodes": args.quality_nodes,
                           "testUsedForSelection": False, "randomSeed": 42},
              "gradientMaximumError": gradient_error,
              "baseModelSHA256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "humanDatasetSHA256": hashlib.sha256(args.human.read_bytes()).hexdigest(),
              "qualityEngine": {**engine_identity, "SHA256": engine_hash},
              "source": {key: value for key, value in human.items() if key != "players"},
              "onnxKernelExecutions": providers, "players": [], "exports": {}}
    csv_rows = []
    for player in players:
        name = player["name"]
        splits = player["splits"]
        samples = sum([splits[key]["samples"] for key in ["train", "validation", "test"]], [])
        keys = [position_key(chess.Board(sample["fen"])) for sample in samples]
        if len(set(keys)) != len(keys):
            raise ValueError(f"Canonical model input overlap for {name}")
        token_array, legal, targets = encode(samples)
        ntrain, nvalidation = len(splits["train"]["samples"]), len(splits["validation"]["samples"])
        train_slice = slice(0, ntrain)
        validation_slice = slice(ntrain, ntrain + nvalidation)
        test_slice = slice(ntrain + nvalidation, len(samples))
        test_samples = samples[test_slice]
        test_legal, test_targets = legal[test_slice], targets[test_slice]
        features, bases, extract_seconds = {}, {}, {}
        identity = hashlib.sha256(prepared.read_bytes() + json.dumps(samples).encode()).hexdigest()
        for elo in [1000, 1500, 2000, 2400]:
            cache = args.output / f"{name}-{elo}-features.npz"
            tick = time.perf_counter()
            if cache.exists():
                with np.load(cache) as saved:
                    if str(saved["identity"]) != identity:
                        raise ValueError(f"Stale feature cache {cache}")
                    features[elo], bases[elo] = saved["features"], saved["base"]
            else:
                features[elo], bases[elo] = extract(gpu, token_array, elo, 128)
                np.savez_compressed(cache, identity=identity, features=features[elo], base=bases[elo])
            extract_seconds[elo] = time.perf_counter() - tick
        if not report.get("benchmark"):
            benchmark_tokens = token_array[:256]
            measurements = {}
            for label, runtime in [("cpu", cpu), ("cuda", gpu)]:
                extract(runtime, benchmark_tokens[:8], 1500, 8)
                tick = time.perf_counter()
                measured = extract(runtime, benchmark_tokens, 1500, 128)
                measurements[label] = time.perf_counter() - tick
                if label == "cpu":
                    reference = measured
                else:
                    error = max(float(np.max(np.abs(a - b))) for a, b in zip(reference, measured))
                    if error > 0.003:
                        raise ValueError(f"CUDA feature inference differs from CPU by {error}")
            report["benchmark"] = {"positions": 256, "seconds": measurements, "maximumCpuCudaError": error}
        test_metrics, predictions, policies = {}, {}, {}
        zero_matrix, zero_bias = np.zeros((64, WIDTH), np.float32), np.zeros(WIDTH, np.float32)
        for elo in [1000, 1500, 2000, 2400]:
            key = f"base{elo}"
            p = probabilities(features[elo][test_slice], bases[elo][test_slice], test_legal, zero_matrix, zero_bias)
            test_metrics[key], predictions[key] = metrics(test_samples, p, test_targets)
            policies[key] = p
        training_reports = {}
        for training_elo, anchor, control in [(1500, 0, False), (2000, 0, False),
                                             (2000, 0.5, False), (2000, 0.8, False), (2000, 0, True)]:
            train = torch_pack(features[training_elo][train_slice], bases[training_elo][train_slice],
                               legal[train_slice], targets[train_slice], "cuda")
            validation = torch_pack(features[training_elo][validation_slice], bases[training_elo][validation_slice],
                                    legal[validation_slice], targets[validation_slice], "cuda")
            matrix, bias, training = fit(train, validation, anchor, random_labels=control)
            model_name = f"train{training_elo}-anchor{anchor:g}" if not control else "randomLabelControl"
            training_reports[model_name] = training
            print(f"{name} {model_name} epoch {training['bestEpoch']} seconds {training['trainingSeconds']:.2f}", flush=True)
            ratings = [1000, 1500, 2000, 2400] if training_elo == 1500 else [2000]
            for elo in ratings:
                for scale in ([0.25, 0.5, 1] if not control and elo == 2000 else [1]):
                    key = f"{model_name}-eval{elo}-scale{scale:g}"
                    p = probabilities(features[elo][test_slice], bases[elo][test_slice], test_legal, matrix, bias, scale)
                    test_metrics[key], predictions[key] = metrics(test_samples, p, test_targets)
                    policies[key] = p
                    reference_rows = predictions[f"base{elo}"]
                    difference = np.array([row["crossEntropy"] - base["crossEntropy"]
                                           for row, base in zip(predictions[key], reference_rows)])
                    test_metrics[key]["crossEntropyChange95"] = paired_interval(test_samples, difference)
            if name == "KnightFan" and training_elo == 2000 and not control:
                filename = f"knightfan-2000-anchor{anchor:g}.onnx"
                report["exports"][model_name] = verify_export(prepared, args.output / filename,
                                                              matrix, bias, token_array, features, bases)
            del train, validation
        quality_cache = args.output / f"{name}-stockfish-{args.quality_nodes}-{engine_hash[:12]}.json"
        selected = np.linspace(0, len(test_samples) - 1, min(args.quality_positions, len(test_samples)), dtype=int)
        quality_fens = [test_samples[i]["fen"] for i in selected]
        if quality_cache.exists():
            scored = json.loads(quality_cache.read_text())
            if [row["fen"] for row in scored] != quality_fens:
                raise ValueError(f"Stale quality cache {quality_cache}")
        else:
            scored = None
        if scored is None:
            tasks = [(str(args.stockfish.resolve()), fen, args.quality_nodes, engine_hash) for fen in quality_fens]
            with ThreadPoolExecutor(max_workers=args.workers) as executor:
                scored = list(executor.map(score_position, tasks))
            quality_cache.write_text(json.dumps(scored))
        if [row["fen"] for row in scored] != quality_fens or any(
                row["nodesBudget"] != args.quality_nodes or row["engineSHA256"] != engine_hash for row in scored):
            raise ValueError(f"Quality cache does not match the requested protocol {quality_cache}")
        for key, p in policies.items():
            expected_losses, top_losses, blunder_masses = [], [], []
            for i, scored_row in zip(selected, scored):
                sample, prediction = test_samples[i], predictions[key][i]
                black = sample["fen"].split()[1] == "b"
                expected_losses.append(sum(float(p[i, MOVES[canonical_move(move, black)]]) * loss
                                           for move, loss in scored_row["losses"].items()))
                blunder_masses.append(sum(float(p[i, MOVES[canonical_move(move, black)]])
                                          for move, loss in scored_row["losses"].items() if loss >= 100))
                top_losses.append(scored_row["losses"][prediction["chosen"]])
                prediction.update({"expectedCpLoss": expected_losses[-1], "topCpLoss": top_losses[-1],
                                   "probabilityLossAtLeast100cp": blunder_masses[-1]})
            test_metrics[key]["quality"] = {
                "positions": len(selected), "expectedCpLoss": float(np.mean(expected_losses)),
                "topCpLoss": float(np.mean(top_losses)), "probabilityLossAtLeast100cp": float(np.mean(blunder_masses)),
                "minimumSearchDepth": min(row["minimumDepth"] for row in scored)}
            for row in predictions[key]:
                csv_rows.append({"player": name, "model": key, **row})
        for key in policies:
            if key.startswith("base"):
                continue
            elo = int(key.split("-eval")[1].split("-")[0])
            reference = predictions[f"base{elo}"]
            difference = np.array([predictions[key][i]["expectedCpLoss"] - reference[i]["expectedCpLoss"] for i in selected])
            test_metrics[key]["quality"]["expectedCpLossChange95"] = paired_interval(
                [test_samples[i] for i in selected], difference)
        report["players"].append({"name": name, "medianRating": player["medianRating"],
                                  "sourceGames": player["sourceGames"],
                                  "counts": {key: len(value["samples"]) for key, value in splits.items()},
                                  "extractionSeconds": extract_seconds, "training": training_reports,
                                  "test": test_metrics})
        (args.output / "native-report.json").write_text(json.dumps(report, indent=2))
        print(f"Completed {name}", flush=True)
    report["elapsedSeconds"] = time.perf_counter() - started
    report["limitations"] = [
        "Five selected public players are not a representative population",
        "One source period and one deterministic training seed",
        "Whole game bootstrap intervals do not account for repeated model comparisons",
        "Centipawn estimates use bounded Stockfish MultiPV searches and are not an Elo measurement",
        "Trait averages and next move agreement do not establish complete human style or autonomous game behavior",
        "Test results compare predeclared variants and do not choose a product default"
    ]
    (args.output / "native-report.json").write_text(json.dumps(report, indent=2))
    fields = list(dict.fromkeys(key for row in csv_rows for key in row))
    with (args.output / "test-predictions.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(csv_rows)
    print(json.dumps({"elapsedSeconds": report["elapsedSeconds"], "cudaKernels": providers}, indent=2))


if __name__ == "__main__":
    main()
