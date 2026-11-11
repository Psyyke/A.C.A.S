"""Publish measured preset evidence and a compact offline review."""

import argparse
import csv
import hashlib
from html import escape
import json
from pathlib import Path
import statistics

from native_review import chart


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--curation", type=Path, help="Confirmed catalog report for publishing current app evidence")
    args = parser.parse_args()
    report = json.loads((args.study / "personality-report.json").read_text())
    browser_path = Path(__file__).resolve().parents[1] / "personality-positions.json"
    practice = json.loads((args.study / "practice.json").read_text())
    if json.loads(browser_path.read_text()) != practice["dataset"]:
        raise ValueError("The shipped browser positions differ from the tested positions")
    rollouts = json.loads((args.study / "personality-rollouts.json").read_text())
    played = {profile["id"]: profile for profile in rollouts["profiles"]}
    if len(report["profiles"]) != 50 or set(played) != {profile["id"] for profile in report["profiles"]}:
        raise ValueError("Both completed studies must include all 50 personalities")
    evidence, spreadsheet, rows = [], [], []
    for profile in report["profiles"]:
        rollout = played[profile["id"]]
        visited = rollout["personalVisitedBoards"]
        passed = profile["passed"] and visited["expectedScore"] > visited["baseExpectedScore"]
        evidence.append({"id": profile["id"], "passed": passed, "elo": profile["elo"],
                         "configuration": profile["configuration"],
                         "baseKL": profile["base"]["KL"], "learnedKL": profile["personal"]["KL"],
                         "scoreChange95": profile["scoreChange95"],
                         "rolloutScoreChange": visited["expectedScore"] - visited["baseExpectedScore"],
                         "testPositions": report["protocol"]["counts"]["test"],
                         "autonomousGames": rollouts["protocol"]["gamesPerPreset"]})
        spreadsheet.append({"id": profile["id"], "name": profile["name"], "baseSetting": profile["elo"],
                            "passed": passed, "baseKL": profile["base"]["KL"], "personalKL": profile["personal"]["KL"],
                            "teacherGapClosed": profile["gapClosed"], "baseScore": profile["base"]["score"],
                            "personalScore": profile["personal"]["score"],
                            "rolloutScoreChange": visited["expectedScore"] - visited["baseExpectedScore"]})
        result = rollout["outcomes"]["personal"]
        rows.append(f'<tr><th>{escape(profile["name"])}</th><td>{profile["elo"]}</td>'
                    f'<td>{profile["base"]["KL"]:.3f}</td><td>{profile["personal"]["KL"]:.3f}</td>'
                    f'<td>{profile["gapClosed"] * 100:.1f}%</td><td>{visited["expectedScore"] - visited["baseExpectedScore"]:.3f}</td>'
                    f'<td>{result["wins"]}/{result["draws"]}/{result["losses"]}/{result["unfinished"]}</td>'
                    f'<td>{"Passed" if passed else "Not confirmed"}</td></tr>')
    curation = None
    if args.curation:
        catalog = json.loads(args.curation.read_text())
        selected = set(catalog["selected"])
        if not catalog["confirmed"] or not selected or catalog["source"]["practiceSHA256"] != report["practiceSHA256"]:
            raise ValueError("A confirmed catalog from the same training study is required")
        profiles = [row for row in catalog["profiles"] if row["id"] in selected]
        for row in profiles:
            old = next(profile for profile in evidence if profile["id"] == row["id"])
            if not row["eligible"] or not row["confirmation"]["passed"] or old["configuration"] != row["configuration"]:
                raise ValueError("Catalog configuration or confirmation does not match the published evidence")
        pairs_path = args.curation.with_name("pairwise-policies.json")
        pairs = [row for row in json.loads(pairs_path.read_text()) if set(row["profiles"]).issubset(selected)]
        if len(pairs) != len(selected) * (len(selected) - 1) // 2 or not all(row["distinct"] for row in pairs):
            raise ValueError("The published catalog lacks complete pairwise distinctness evidence")
        curation = {"confirmed": True, "selected": catalog["selected"], "protocol": catalog["protocol"],
                    "reportSHA256": hashlib.sha256(args.curation.read_bytes()).hexdigest(),
                    "source": catalog["source"], "profiles": profiles, "pairs": pairs}
    args.evidence.write_text(json.dumps({"version": 2 if curation else 1, "method": "Full 512 frozen Maia 3 features and browser SGD",
                                         "browserDatasetSHA256": hashlib.sha256(browser_path.read_bytes()).hexdigest(),
                                         "protocol": report["protocol"],
                                         "meaning": "Lower held out teacher KL and increased requested score, also at nearby settings and on autonomous visited boards. Not perfect imitation or measured Elo.",
                                         "profiles": evidence, "curation": curation}, indent=2))
    with (args.study / "personality-summary.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(spreadsheet[0]))
        writer.writeheader()
        writer.writerows(spreadsheet)
    count = sum(row["passed"] for row in evidence)
    curves = [(profile["name"], [(point["epoch"], point["validationLoss"]) for point in profile["training"]["history"]])
              for profile in report["profiles"] if profile["id"] in ["bunker", "knight-fan", "alien"]]
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DoppelMaia personality study</title><style>
body{{font:16px/1.6 system-ui,sans-serif;background:#f2f6f7;color:#213a43;margin:0}}
main{{max-width:1120px;padding:24px 16px;margin:auto}}section{{padding:20px;background:white;border:2px solid #213a43;border-bottom-width:5px;border-radius:5px;margin:20px 0}}
h2{{margin-top:0}}.scroll{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{text-align:left;padding:9px;border-bottom:1px solid #dce4e5;overflow-wrap:anywhere}}thead{{background:#e8eeee}}
svg{{width:100%;max-width:700px;display:block;margin:auto}}svg text{{font:12px system-ui;fill:#213a43}}.legend{{text-align:center}}.legend span{{margin:0 12px}}a{{color:#365f76}}
@media(max-width:600px){{section{{padding:12px}}table{{min-width:650px}}}}</style>
<main><h1>DoppelMaia personality study</h1>
<section><h2>Exploration, not a catalog quota</h2><p>These fifty configurations were candidates.
Passing a requested preference test does not make every pair a distinct personality.
The <a href="../doppelmaia-personality-curation/index.html">curated collection</a> adds common rating policy
separation, actual chosen move consistency and fresh autonomous openings.</p></section>
<section><h2>What passed</h2><p>{count} of 50 preset preferences passed the stated checks.
The targets, move features, learning rate, SGD momentum, decay, shuffle and validation selection match the browser method.
CUDA speeds up that work. It does not get a different learning algorithm.</p>
<p>Each preset learned from {report["protocol"]["counts"]["train"]} anonymous practice positions,
selected checkpoints using {report["protocol"]["counts"]["validation"]} separate positions
and was measured on {report["protocol"]["counts"]["test"]} new board inputs from other games.
The same adapter was also evaluated 200 conditioning points lower and higher.</p></section>
<section><h2>What the scores mean</h2><p>A personality is a set of explicit soft preferences.
The teacher tilts the legal base policy toward those preferences. Lower KL means the learned policy better matches that teacher.
The gap closed column measures reduction in teacher KL, not a percentage of human personality copied.</p>
<p>A passing preset lowers held out KL and increases its requested score with paired whole game intervals excluding zero,
retains the direction at nearby rating settings, and increases expected preference on boards reached during autonomous play.
Training never selects settings from these test results.</p>
<p>Four shared openings, both colors, eight personal and eight base control games per preset check autonomous behavior.
Recorded opponent moves are not replayed. Each game is capped at {rollouts["protocol"]["maximumNewPlies"]} new plies.
Unfinished games are not draws. W/D/L/U means wins, draws, losses and unfinished games.
This is not a strength tournament. A bunker with a 2200 base setting has not earned a measured 2200 rating.</p></section>
<section><h2>All 50 personalities</h2><div class="scroll"><table><thead><tr><th>Preset</th><th>Base setting</th><th>Base KL</th><th>Learned KL</th><th>Teacher gap closed</th><th>Autonomous score gain</th><th>W/D/L/U</th><th>Evidence</th></tr></thead><tbody>
{"".join(rows)}</tbody></table></div></section>
<section><h2>Actual validation learning</h2>{chart(curves, "Epoch", "Soft teacher cross entropy")}</section>
<section><h2>Limits worth keeping visible</h2><p>These are learned one move preferences, not long horizon plans or a complete personality.
Extreme styles can make bad moves. A larger conditioning number does not establish stronger play.
None of these results proves near perfect copying of a real person.</p>
<p>Average teacher KL fell from {statistics.mean(p["base"]["KL"] for p in report["profiles"]):.3f}
to {statistics.mean(p["personal"]["KL"] for p in report["profiles"]):.3f}.
The individual scores matter more than a single flattering average.</p></section>
<section><h2>Files to review</h2><ul>
<li><a href="personality-summary.csv">Small results spreadsheet</a></li>
<li><a href="personality-report.json">Every profile, configuration, learning curve and interval</a></li>
<li><a href="personality-rollouts.json">Whole game outcomes and visited board scores</a></li>
<li><a href="bunker.onnx">Bunker example weights</a></li><li><a href="knight-fan.onnx">Knight fan example weights</a></li>
<li><a href="alien.onnx">Alien example weights</a></li>
<li><a href="../doppelmaia-readiness-study/review.html">Expanded real player imitation study</a></li>
</ul><p>Each preset also has a PGN named after its identifier, such as <a href="bunker-games.pgn">bunker games</a>,
and a move file with the exact positions and policies.</p></section></main></html>"""
    (args.study / "review.html").write_text(page, encoding="utf-8")
    print(args.study / "review.html", f"{count}/50 passed")


if __name__ == "__main__":
    main()
