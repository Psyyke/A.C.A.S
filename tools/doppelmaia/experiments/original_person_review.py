"""Summarize single-player holdout reliability without treating moves as independent."""

import csv
import json
from pathlib import Path

import numpy as np

from original_review import render

DIRECTORY = Path(r"temp\doppelmaia-original-person")


def main():
    dataset = json.loads((DIRECTORY / "dataset.json").read_text())
    report = json.loads((DIRECTORY / "report.json").read_text())
    split_games = {split: len({row["gameId"] for row in samples}) for split, samples in dataset["splits"].items()}
    summary = {"player": dataset["player"], "medianRating": dataset["medianRating"],
               "sourceGames": dataset["sourceGames"], "sampledGames": split_games,
               "positions": {key: len(rows) for key, rows in dataset["splits"].items()},
               "historyRepetitionFlags": sum(sum(row["repetitions"]) for rows in dataset["splits"].values() for row in rows),
               "models": []}
    for model in report["models"]:
        with (DIRECTORY / model["model"] / "test-predictions.csv").open(newline="") as stream:
            predictions = list(csv.DictReader(stream))
        groups = {}
        for row in predictions:
            groups.setdefault(row["gameId"], []).append([row["before"] == row["target"], row["after"] == row["target"]])
        values = [np.array(rows, np.float64) for rows in groups.values()]
        rng = np.random.default_rng(42)
        boot = np.array([np.concatenate([values[index] for index in rng.integers(len(values), size=len(values))]).mean(0)
                         for _ in range(2000)])
        history = model["history"]
        row = {"model": model["model"], "bestEpoch": model["bestEpoch"],
               "epochsExecuted": len(history) - 1, "baseline": model["baseline"], "exported": model["exported"],
               "testAgreementCluster95CI": {
                   "before": np.quantile(boot[:, 0], [.025, .975]).tolist(),
                   "after": np.quantile(boot[:, 1], [.025, .975]).tolist(),
                   "pairedDelta": np.quantile(boot[:, 1] - boot[:, 0], [.025, .975]).tolist()},
               "trainLossEpoch0": history[0]["trainLoss"], "trainLossFinalEpoch": history[-1]["trainLoss"],
               "validationLossEpoch0": history[0]["validationLoss"],
               "validationLossByEpoch": [point["validationLoss"] for point in history],
               "reason": ("No epoch improved validation CE; epoch-zero safeguard preserved the exact source."
                          if not model["retained"] else "Validation selected a changed quantized checkpoint; test was not used for selection.")}
        summary["models"].append(row)
    summary["interpretation"] = ("A meaningful single-player external holdout for a bounded pilot, not a high-precision benchmark. "
                                 "Multiple moves per game are correlated; intervals resample complete source-game clusters. "
                                 "One player and one chronological holdout cannot establish generalization across players, strength, or style fidelity. "
                                 "No test-based hyperparameter search was performed.")
    (DIRECTORY / "person-summary.json").write_text(json.dumps(summary, indent=2))
    render(DIRECTORY)
    review = DIRECTORY / "review.html"
    text = review.read_text(encoding="utf-8")
    text = text.replace("<h2>Verification</h2>", "<h2>Player holdout reliability</h2><p>" +
                        str(split_games) + " sampled independent source games. Agreement intervals use 2,000 source-game "
                        "cluster bootstrap resamples; see person-summary.json. Moves within a game are not independent.</p><h2>Verification</h2>")
    review.write_text(text, encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
