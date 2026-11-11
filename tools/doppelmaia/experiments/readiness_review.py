"""Summarize expanded human imitation without equating accuracy and personality."""

import argparse
from collections import Counter, defaultdict
import csv
from html import escape
import json
from pathlib import Path
import statistics
import chess

from native_review import chart
from native_data import position_key
from native_study import canonical_move


def label_consistency(source):
    results = []
    for player in source["players"]:
        groups = defaultdict(Counter)
        for split in ["train", "validation", "test"]:
            for sample in player["splits"][split]["samples"]:
                board = chess.Board(sample["fen"])
                groups[position_key(board)][canonical_move(sample["move"], not board.turn)] += 1
        repeated = [counts for counts in groups.values() if sum(counts.values()) >= 2]
        total = sum(sum(counts.values()) for counts in repeated)
        results.append({"name": player["name"], "repeatedInputs": len(repeated),
                        "conflictingRepeatedInputs": sum(len(counts) > 1 for counts in repeated),
                        "repeatedSamples": total,
                        "posthocModalAgreement": sum(max(counts.values()) for counts in repeated) / total if total else None})
    return {"meaning": "Posthoc diagnostic using all partitions, not a heldout model score or an upper bound on a richer model.",
            "players": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    report = json.loads((args.study / "readiness-report.json").read_text())
    players = report["players"]
    consistency = label_consistency(json.loads((args.study / "human-dataset.json").read_text()))
    (args.study / "label-consistency.json").write_text(json.dumps(consistency, indent=2))
    mean = statistics.mean
    settings = report["protocol"]["settings"]
    rows, summary = [], []
    for player in players:
        for setting in settings:
            result = player["settings"][setting]
            summary.append({"player": player["name"], "setting": setting,
                            "sourceGames": player["sourceGames"], "matchedSetting": player["matchedRating"],
                            "trainingPositions": result["trainingPositions"],
                            "baseMoveMatch": player["base"]["all"]["moveMatch"],
                            "personalMoveMatch": result["test"]["all"]["moveMatch"],
                            "baseLoss": player["base"]["all"]["crossEntropy"],
                            "personalLoss": result["test"]["all"]["crossEntropy"],
                            "baseNovelMoveMatch": player["base"]["novel"]["moveMatch"],
                            "personalNovelMoveMatch": result["test"]["novel"]["moveMatch"]})
        result = player["settings"]["full-max"]["test"]
        rows.append(f'<tr><th>{player["name"]}</th><td>{player["sourceGames"]}</td><td>{player["matchedRating"]}</td>'
                    f'<td>{player["base"]["all"]["moveMatch"] * 100:.1f}%</td><td>{result["all"]["moveMatch"] * 100:.1f}%</td>'
                    f'<td>{player["base"]["novel"]["moveMatch"] * 100:.1f}%</td><td>{result["novel"]["moveMatch"] * 100:.1f}%</td>'
                    f'<td>{result["all"]["lossChange95"]["low"]:.3f} to {result["all"]["lossChange95"]["high"]:.3f}</td></tr>')
    setting_rows = []
    for setting in settings:
        measured = [player["settings"][setting] for player in players]
        setting_rows.append(f'<tr><th>{escape(setting)}</th><td>{mean(row["trainingPositions"] for row in measured):.0f}</td>'
                            f'<td>{mean(row["test"]["all"]["moveMatch"] for row in measured) * 100:.2f}%</td>'
                            f'<td>{mean(row["test"]["novel"]["moveMatch"] for row in measured) * 100:.2f}%</td>'
                            f'<td>{mean(row["test"]["all"]["crossEntropy"] for row in measured):.3f}</td>'
                            f'<td>{mean(row["test"]["traits"]["meanAbsoluteError"] for row in measured):.4f}</td></tr>')
    groups = []
    for group in ["all", "opening", "familiar", "novel"]:
        groups.append(f'<tr><th>{group.capitalize()}</th>'
                      f'<td>{mean(p["base"][group]["moveMatch"] for p in players) * 100:.2f}%</td>'
                      f'<td>{mean(p["settings"]["full-max"]["test"][group]["moveMatch"] for p in players) * 100:.2f}%</td></tr>')
    transfer_rows = []
    for offset in [-200, 0, 200]:
        for mode in ["base", "full-max", "full-balanced", "full-prefer-base"]:
            values = [player["transfer"][str(player["matchedRating"] + offset)][mode] for player in players]
            qualities = [value["expectedCentipawnLoss"] for value in values if "expectedCentipawnLoss" in value]
            quality = f"{mean(qualities):.2f}" if qualities else "Not measured"
            transfer_rows.append(f'<tr><th>{offset:+d}</th><td>{escape(mode)}</td>'
                                 f'<td>{mean(v["metrics"]["moveMatch"] for v in values) * 100:.2f}%</td>'
                                 f'<td>{mean(v["traits"]["meanAbsoluteError"] for v in values):.4f}</td><td>{quality}</td></tr>')
    curves = [(player["name"], [(point["epoch"], point["validationLoss"])
                                for point in player["settings"]["full-max"]["training"]["history"]]) for player in players[:4]]
    games = sum(player["sourceGames"] for player in players)
    counts = {key: sum(player["counts"][key] for player in players) for key in ["train", "validation", "test"]}
    improved = sum(p["settings"]["full-max"]["test"]["all"]["crossEntropy"] < p["base"]["all"]["crossEntropy"] for p in players)
    controls = sum(p["settings"]["random-labels"]["training"]["bestEpoch"] == 0 for p in players)
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DoppelMaia expanded imitation study</title><style>
body{{font:16px/1.6 system-ui,sans-serif;background:#f2f6f7;color:#213a43;margin:0}}main{{max-width:1120px;margin:auto;padding:24px 16px}}
section{{background:white;border:2px solid #213a43;border-bottom-width:5px;border-radius:5px;margin:20px 0;padding:20px}}
h2{{margin-top:0}}.scroll{{overflow:auto}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{text-align:left;padding:9px;border-bottom:1px solid #dce4e5;overflow-wrap:anywhere}}thead{{background:#e8eeee}}
svg{{width:100%;max-width:700px;display:block;margin:auto}}svg text{{font:12px system-ui;fill:#213a43}}.legend{{text-align:center}}.legend span{{margin:0 12px}}a{{color:#365f76}}
@media(max-width:600px){{section{{padding:12px}}table{{min-width:650px}}}}</style>
<main><h1>DoppelMaia expanded imitation study</h1>
<section><h2>Historical source correction</h2><p>Nine of the twenty accounts in the original published run had BOT titles.
Those are mixed account results, not human only imitation evidence. Ratings were also estimated
using all partitions. The historical numbers remain available with that qualification.</p>
<p>The <a href="../doppelmaia-generalization-study/index.html">new audited study</a> excludes BOT titles,
uses training only ratings and trains the full transformer. That method now runs in the browser too.</p></section>
<section><h2>The honest answer</h2><p>CUDA makes the same frozen feature and adapter method faster.
It does not turn a modest imitation result into a near perfect copy.
This study fixes the current browser method rather than selecting a different architecture for each person.
It tests more games, learning budgets, all three imitation modes and nearby rating settings.</p>
<p>The first {report["source"]["scannedGames"]:,} local source games supplied {games:,} games for {len(players)} prolific players.
Chronological whole game splits contain {counts["train"]:,} training, {counts["validation"]:,} validation and {counts["test"]:,} test positions.
This archive overlaps earlier research, so this is not an independent replication on a new population.</p></section>
<section><h2>Matched conditioning, later games</h2><p>Means give every player equal weight.
The full Max personalization model improved prediction loss for {improved} of {len(players)} players.
Familiar board recall and new board generalization remain separate.</p>
<div class="scroll"><table><thead><tr><th>Test group</th><th>Untouched base</th><th>Personal model</th></tr></thead><tbody>{"".join(groups)}</tbody></table></div></section>
<section><h2>More data and different balances</h2><p>All settings use the same validation and sealed test games.
Smaller training budgets are evenly spread subsets, not the first turns of a few games.
Trait error is the average absolute error of five recorded move frequencies. It is not a complete style distance.
Random labels kept epoch zero for {controls} of {len(players)} players.</p>
<div class="scroll"><table><thead><tr><th>Setting</th><th>Mean training positions</th><th>All move match</th><th>New board match</th><th>Prediction loss</th><th>Trait error</th></tr></thead><tbody>{"".join(setting_rows)}</tbody></table></div></section>
<section><h2>Each player</h2><div class="scroll"><table><thead><tr><th>Player</th><th>Games</th><th>Base setting</th><th>Base match</th><th>Personal match</th><th>New base match</th><th>New personal match</th><th>Loss change interval</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div></section>
<section><h2>Can it play better while keeping habits?</h2><p>The same learned model is evaluated without new training at 200 conditioning points below and above its source setting.
Trait error and recorded move agreement measure only narrow aspects of fidelity.
Expected centipawn loss uses 24 unique test boards for each of the first five players, spread across phases.
Stockfish scores every legal move with 250,000 nodes per board. Lower is better, but this small bounded search check is not a measured Elo.</p>
<div class="scroll"><table><thead><tr><th>Conditioning offset</th><th>Mode</th><th>Move match</th><th>Trait error</th><th>Expected cp loss</th></tr></thead><tbody>{"".join(transfer_rows)}</tbody></table></div>
<p>Imitation can preserve mistakes. A higher setting or gentler balance can change the quality tradeoff,
but these data cannot promise stronger play with an intact human personality.</p></section>
<section><h2>Actual validation curves</h2>{chart(curves, "Epoch", "Observed move cross entropy")}</section>
<section><h2>What is ready and what is not</h2><p>The browser can train and export real personalized weights and tested soft preference presets.
It is not validated as a near perfect human personality copier.
Recorded human moves are stochastic, so 100% exact move agreement would not establish a faithful distribution either.
The same piece placement has conflicting recorded choices for every player in this dataset.
An all partition label consistency diagnostic is linked below. It does not choose training settings
and is not presented as a held out score or as a limit for a richer context model.
Novel positions, different opponents, multiple time periods, repeat seeds and larger strength tournaments remain important.</p></section>
<section><h2>Review files</h2><ul><li><a href="readiness-summary.csv">Small results spreadsheet</a></li>
<li><a href="readiness-report.json">All settings, learning histories and intervals</a></li>
<li><a href="readiness-predictions.csv">Individual full model test predictions</a></li>
<li><a href="human-dataset.json">Source links and chronological split ownership</a></li>
<li><a href="label-consistency.json">Conflicting choices for identical model inputs</a></li>
<li><a href="../doppelmaia-personality-study/review.html">All 50 personality preference tests and autonomous games</a></li>
</ul></section></main></html>"""
    (args.study / "review.html").write_text(page, encoding="utf-8")
    with (args.study / "readiness-summary.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(summary[0]))
        writer.writeheader()
        writer.writerows(summary)
    print(args.study / "review.html")


if __name__ == "__main__":
    main()
