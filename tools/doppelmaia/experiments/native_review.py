"""Build a small offline review page and summary CSV from measured results."""

import argparse
import csv
from html import escape
import json
from pathlib import Path
from string import Template


MODEL_NAMES = {
    "base1500": "Base 1500", "base2000": "Base 2000",
    "train1500-anchor0-eval2000-scale1": "Learn at 1500 then play at 2000",
    "train2000-anchor0-eval2000-scale1": "Learn at 2000",
    "train2000-anchor0.5-eval2000-scale1": "Balance both",
    "train2000-anchor0.8-eval2000-scale1": "Stay closer to the base",
    "randomLabelControl-eval2000-scale1": "Random labels"
}
COLORS = ["#4f6881", "#b16a32", "#268168", "#947621"]


def chart(series: list[tuple[str, list[tuple[float, float]]]], xlabel: str, ylabel: str,
          *, colors: list[str] | None = None, marker: float | None = None) -> str:
    palette = COLORS if colors is None else colors
    if not palette:
        raise ValueError("A learning chart needs at least one series color")
    points = [point for _, values in series for point in values]
    xmin, xmax = min(point[0] for point in points), max(point[0] for point in points)
    span = xmax - xmin or 1
    ymin, ymax = min(point[1] for point in points), max(point[1] for point in points)
    padding = max((ymax - ymin) * 0.1, 0.01)
    ymin, ymax = max(0, ymin - padding), ymax + padding
    x = lambda value: 55 + (value - xmin) / span * 510
    y = lambda value: 260 - (value - ymin) / (ymax - ymin) * 220
    parts = ['<svg viewBox="0 0 640 310" role="img" aria-label="' + escape(ylabel) + '">']
    for fraction in [0, 0.25, 0.5, 0.75, 1]:
        value = ymin + (ymax - ymin) * fraction
        parts.append(f'<path d="M55 {y(value):.2f}H565" stroke="#dce4e5"/>'
                     f'<text x="48" y="{y(value) + 4:.2f}" text-anchor="end">{value:.2f}</text>')
    ticks = sorted({point[0] for point in points})
    if len(ticks) > 5:
        ticks = [xmin + span * fraction for fraction in [0, 0.25, 0.5, 0.75, 1]]
    for value in ticks:
        parts.append(f'<text x="{x(value):.2f}" y="280" text-anchor="middle">{value:g}</text>')
    for index, (label, values) in enumerate(series):
        color = palette[index % len(palette)]
        coordinates = " ".join(f"{x(a):.2f},{y(b):.2f}" for a, b in values)
        parts.append(f'<polyline points="{coordinates}" fill="none" stroke="{color}" stroke-width="2"/>')
        for a, b in values:
            parts.append(f'<circle cx="{x(a):.2f}" cy="{y(b):.2f}" r="3" fill="{color}">'
                         f'<title>{escape(label)} {a:g} {b:.4f}</title></circle>')
    if marker is not None:
        if not xmin <= marker <= xmax:
            raise ValueError("The chosen checkpoint is outside the plotted history")
        parts.append(f'<path d="M{x(marker):.2f} 40 V260" stroke="#aaa" stroke-dasharray="4 4"/>')
    parts.append(f'<text x="310" y="304" text-anchor="middle">{escape(xlabel)}</text>'
                 f'<text x="55" y="22">{escape(ylabel)}</text></svg>')
    parts.append('<p class="legend">' + " ".join(f'<span style="color:{palette[i % len(palette)]}">{escape(label)}</span>'
                                              for i, (label, _) in enumerate(series)) + "</p>")
    return "".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    report = json.loads((args.study / "native-report.json").read_text())
    rollouts = json.loads((args.study / "rollout-report.json").read_text())
    humans = [player for player in report["players"] if player["name"] != "KnightFan"]
    knight = next(player for player in report["players"] if player["name"] == "KnightFan")
    summary = []
    human_rows, synthetic_rows, rollout_rows = [], [], []
    for player in report["players"]:
        for model, name in MODEL_NAMES.items():
            metrics = player["test"][model]
            quality = metrics["quality"]
            summary.append({"player": player["name"], "model": name, "positions": metrics["positions"],
                            "cross_entropy": metrics["crossEntropy"], "move_match": metrics["moveMatch"],
                            "trait_error": metrics["traitMeanAbsoluteError"],
                            "knight_probability": metrics["predictedTraits"]["knight"],
                            "expected_cp_loss": quality["expectedCpLoss"], "top_cp_loss": quality["topCpLoss"],
                            "ce_change_low95": metrics.get("crossEntropyChange95", {}).get("low", ""),
                            "ce_change_high95": metrics.get("crossEntropyChange95", {}).get("high", "")})
        if player["name"] == "KnightFan":
            continue
        base = player["test"]["base2000"]
        learned = player["test"]["train2000-anchor0.5-eval2000-scale1"]
        interval = learned["crossEntropyChange95"]
        human_rows.append(f'<tr><th>{player["name"]}</th><td>{player["medianRating"]:.0f}</td>'
                          f'<td>{base["crossEntropy"]:.3f}</td><td>{learned["crossEntropy"]:.3f}</td>'
                          f'<td>{base["moveMatch"] * 100:.1f}%</td><td>{learned["moveMatch"] * 100:.1f}%</td>'
                          f'<td>{interval["low"]:.3f} to {interval["high"]:.3f}</td></tr>')
    for model in ["base2000", "train2000-anchor0-eval2000-scale1",
                  "train2000-anchor0.5-eval2000-scale1", "train2000-anchor0.8-eval2000-scale1"]:
        metrics = knight["test"][model]
        synthetic_rows.append(f'<tr><th>{MODEL_NAMES[model]}</th><td>{metrics["predictedTraits"]["knight"] * 100:.1f}%</td>'
                              f'<td>{metrics["quality"]["expectedCpLoss"]:.1f}</td></tr>')
    for model, metrics in rollouts["models"].items():
        name = {"base2000": "Base 2000", "anchor0": "Learn at 2000", "anchor0.5": "Balance both",
                "anchor0.8": "Stay closer to the base"}[model]
        rollout_rows.append(f'<tr><th>{name}</th><td>{metrics["knightChoiceRate"] * 100:.1f}%</td>'
                            f'<td>{metrics["wins"]}</td><td>{metrics["draws"]}</td><td>{metrics["losses"]}</td>'
                            f'<td>{metrics["truncated"]}</td></tr>')
    with (args.study / "summary.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(summary[0]))
        writer.writeheader()
        writer.writerows(summary)
    curves = []
    for anchor, name in [(0, "Learn at 2000"), (0.5, "Balance both"), (0.8, "Stay closer to the base")]:
        history = knight["training"][f"train2000-anchor{anchor:g}"]["history"]
        curves.append((name, [(point["epoch"], point["validationLoss"]) for point in history]))
    transfer = []
    for model, name in [("base", "Base"), ("trained", "Learn at 1500")]:
        values = []
        for elo in [1000, 1500, 2000, 2400]:
            key = f"base{elo}" if model == "base" else f"train1500-anchor0-eval{elo}-scale1"
            values.append((elo, knight["test"][key]["predictedTraits"]["knight"] * 100))
        transfer.append((name, values))
    benchmark = report["benchmark"]
    speed = benchmark["seconds"]["cpu"] / benchmark["seconds"]["cuda"]
    document = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DoppelMaia native study</title><style>
body{font:16px/1.6 system-ui,sans-serif;color:#213a43;background:#f2f6f7;margin:0}
main{max-width:1080px;margin:auto;padding:28px 20px}h1{margin-bottom:4px}h2{margin-top:32px}
section{padding:18px 22px;background:white;border:2px solid #213a43;border-bottom-width:5px;border-radius:5px;margin:20px 0}
table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #dce4e5}
thead{background:#e8eeee}.scroll{overflow:auto}svg{width:100%;max-width:700px;display:block;margin:auto}
svg text{font:12px system-ui;fill:#213a43}.legend{text-align:center}.legend span{display:inline-block;margin:0 12px}
a{color:#365f76}code{overflow-wrap:anywhere}li{margin:8px 0}.note{font-size:14px;color:#4f6881}
</style><main><h1>DoppelMaia native study</h1>
<section><h2>Historical source correction</h2><p>This collector did not exclude BOT accounts.
These averages have not been established as human only evidence. Ratings were estimated using all
partitions. See the <a href="../doppelmaia-generalization-study/index.html">new audited study</a>
for title filtering, training only ratings and full transformer training.</p></section>
<section><h2>This was the rating transfer study</h2>
<p>The earlier 58.3% to 59.8% move agreement result compared models at a 2000 setting with players whose source ratings were about 1100 to 1700. It was not a comparison at each person's own rating.</p>
<p><a href="../doppelmaia-imitation-study-v2/review.html">Open the newer matched rating and opening study</a> for full features, personal openings, new board checks and player ownership controls.</p></section>
<p>Can a model learn someone's habits while starting from a higher rating setting?</p>
<section><h2>The short answer</h2>
<p>Some habits carry over. A higher setting does not turn a learned mistake into a good move. We can keep more of the starting model's preferences when that balance matters.</p>
<p>Average move prediction improved for $improved_count of $human_count public players after training at 2000. Some gains are modest. Intervals and per player results are below. This is early evidence of learning useful personal patterns. It is not a copy of a whole personality or a measured playing rating.</p></section>
<section><h2>Archive accounts on later games</h2>
<p>The public Lichess source contains $source_games games from $human_count selected players. Each model trains only on that player's moves. Games are ordered by time and split into 60 percent training, 20 validation and 20 sealed test. Identical model inputs cannot cross the splits.</p>
<p>This table compares untouched Maia at 2000 with Balance both at 2000. Lower prediction loss is better. Higher move match means the model more often chose the recorded move. The interval describes the change in loss, with whole games resampled together.</p>
<div class="scroll"><table><thead><tr><th>Player</th><th>Median source rating</th><th>Base loss</th><th>Learned loss</th><th>Base match</th><th>Learned match</th><th>Loss change interval</th></tr></thead><tbody>
""" + "".join(human_rows) + """</tbody></table></div>
<p class="note">These players were chosen by game count and source ratings, not by whether training worked. Usernames are replaced by labels. Their source ratings are not ratings measured for these engines.</p></section>
<section><h2>The cost of an exaggerated habit</h2>
<p>KnightFan always wants a knight move when one is available. The sealed test has 300 positions with both knight and other choices. More knight probability means more of this habit. Lower expected centipawn loss means less disagreement with the quality reference.</p>
<div class="scroll"><table><thead><tr><th>Model at 2000</th><th>Knight probability</th><th>Expected centipawn loss</th></tr></thead><tbody>
""" + "".join(synthetic_rows) + """</tbody></table></div>
<p>Keeping more base habits gives up some imitation and avoids some poor moves. It does not remove every bad move. Quality uses $quality_positions fixed test positions per model and player, all legal moves, $engine_name and $quality_nodes nodes per position. The lowest completed search depth was $minimum_depth. Losses are capped at 1000 centipawns so a single mating score cannot dominate.</p></section>
<section><h2>Does a habit survive a rating change?</h2>
<p>This is the same adapter trained at 1500 and then evaluated at different settings. No new training happens between the points. The graph shows probability assigned to knight moves on the same sealed test positions.</p>
""" + chart(transfer, "Rating setting", "Knight probability in percent") + """</section>
<section><h2>What happens in whole games?</h2>
<p>Each model played the same $opening_count sampled openings from both colors, for $games_per_model games. Both sides chose their highest probability legal move. The opponent was unchanged Maia at a setting of 2000. Games stopped after $rollout_plies further plies or an earlier chess ending. An unfinished game is not counted as a draw.</p>
<div class="scroll"><table><thead><tr><th>Model</th><th>Knight choice</th><th>Wins</th><th>Draws</th><th>Losses</th><th>Unfinished</th></tr></thead><tbody>
""" + "".join(rollout_rows) + """</tbody></table></div>
<p>The strong knight habit survives whole games, but it loses badly. The gentler version is less extreme. These few paired games against one policy are not an Elo test.</p></section>
<section><h2>Measured learning</h2>
<p>These are real validation measurements for KnightFan. The curves are not simulated progress. The smallest validation loss chooses the checkpoint. Test games never choose an epoch.</p>
""" + chart(curves, "Epoch", "Validation move prediction loss") + f"""</section>
<section><h2>Native hardware checks</h2>
<p>Feature extraction used $gpu_name through native CUDA. Adapter updates used PyTorch CUDA. Parsing and independent engine checks used $workers CPU workers.</p>
<p>The same 256 positions took {benchmark["seconds"]["cpu"]:.3f} seconds on CPU and {benchmark["seconds"]["cuda"]:.3f} seconds on CUDA, about {speed:.1f} times faster in this check. This does not include model loading or downloading.</p>
<p>Native CPU and CUDA updates matched the browser reference within {report["gradientMaximumError"]:.2g}. Full exported models were checked at four rating settings. The report records the actual CUDA kernel executions and model hashes.</p></section>
<section><h2>Files to explore</h2><ul>
<li><a href="summary.csv">Summary spreadsheet</a></li>
<li><a href="native-report.json">All metrics, intervals, settings and learning histories</a></li>
<li><a href="test-predictions.csv">Every sealed test prediction with move and position</a></li>
<li><a href="human-dataset.json">Research positions, source games and separate splits</a></li>
<li><a href="rollout-report.json">Whole game results</a> and <a href="rollout-moves.csv">every rollout move</a></li>
<li><a href="rollout-anchor0.8.pgn">Gentle KnightFan games</a> and <a href="rollout-anchor0.pgn">extreme KnightFan games</a></li>
<li><a href="knightfan-2000-anchor0.8.onnx">Gentle model</a> and <a href="knightfan-2000-anchor0.onnx">extreme model</a>. Load as Maia 3 weights and start at 2000</li>
</ul><p>We still need more players, longer time periods, more training seeds and stronger tournament tests. Prediction gains do not prove that training makes an engine stronger. The supplied public games are not your own games.</p></section></main></html>"""
    document = Template(document).substitute(
        improved_count=sum(player["test"]["train2000-anchor0.5-eval2000-scale1"]["crossEntropy"]
                           < player["test"]["base2000"]["crossEntropy"] for player in humans),
        human_count=len(humans), source_games=sum(player["sourceGames"] for player in humans),
        quality_positions=report["protocol"]["qualityPositionsPerPlayer"],
        quality_nodes=report["protocol"]["qualityNodes"],
        engine_name=escape(report["qualityEngine"]["name"]),
        minimum_depth=min(player["test"]["base2000"]["quality"]["minimumSearchDepth"] for player in report["players"]),
        opening_count=rollouts["protocol"]["gamesPerModel"] // 2,
        games_per_model=rollouts["protocol"]["gamesPerModel"],
        rollout_plies=rollouts["protocol"]["rolloutPlies"],
        gpu_name=escape(report["hardware"]["gpu"]), workers=report["hardware"]["parserAndEngineWorkers"])
    (args.study / "review.html").write_text(document, encoding="utf-8")
    print(args.study / "review.html")


if __name__ == "__main__":
    main()
