"""Small training-only hypotheses, with no test labels or inference changes."""

from collections import Counter, defaultdict
import math

from phase_review import phase


METHODS = ["baseline", "phase-anchor", "phase-balance", "game-balance", "game-balance-strong",
           "choice-distribution", "surprise", "peer-prior"]


def target_recipe(samples, labels, method):
    if method not in METHODS or not samples or len(samples) != len(labels):
        raise ValueError("A known method and matching nonempty examples are required")
    phases = [phase(sample) for sample in samples]
    phase_counts = Counter(phases)
    game_counts = Counter(sample["gameId"] for sample in samples)
    choices = defaultdict(Counter)
    keys = [" ".join(sample["fen"].split()[:4]) for sample in samples]
    for key, label in zip(keys, labels):
        choices[key][int(label)] += 1
    result = []
    for index, (sample, label) in enumerate(zip(samples, labels)):
        category = phases[index]
        anchor = {"opening": 0, "middle": 0.25, "sparse": 0.75}[category] if method == "phase-anchor" else 0.25
        weight = 1
        if method == "phase-balance":
            weight = 1 / math.sqrt(phase_counts[category])
        elif method == "game-balance":
            weight = 1 / math.sqrt(game_counts[sample["gameId"]])
        elif method == "game-balance-strong":
            weight = 1 / game_counts[sample["gameId"]]
        distribution = {int(label): 1.0}
        if method == "choice-distribution":
            counts = choices[keys[index]]
            distribution = {move: 0.5 * count / counts.total() for move, count in counts.items()}
            distribution[int(label)] += 0.5
        result.append({"anchor": anchor, "weight": weight, "distribution": distribution})
    average = sum(row["weight"] for row in result) / len(result)
    for row in result:
        row["weight"] /= average
    return result
