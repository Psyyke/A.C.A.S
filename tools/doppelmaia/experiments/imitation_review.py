"""Create a review page for matched rating imitation and opening behavior."""

import argparse
import csv
from html import escape
import json
from pathlib import Path
import statistics

from native_review import chart


def mean(values):
    return statistics.mean(values)


def table(headers: list[str], rows: list[list[str]]) -> str:
    return '<div class="scroll"><table><thead><tr>' + "".join(f"<th>{escape(value)}</th>" for value in headers) + \
        "</tr></thead><tbody>" + "".join("<tr>" + "".join(f"<td>{value}</td>" for value in row) + "</tr>" for row in rows) + \
        "</tbody></table></div>"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    report = json.loads((args.study / "imitation-report.json").read_text())
    followup = json.loads((args.study / "imitation-followup.json").read_text())
    players = report["players"]
    follow = {player["name"]: player for player in followup["players"]}
    summaries = []
    matched_rows, opening_rows, control_rows, transfer_rows = [], [], [], []
    for player in players:
        name, result = player["name"], player["selected"]["test"]
        row = follow[name]
        matched_rows.append([name, str(player["matchedRating"]),
                             f'{player["base"]["all"]["moveMatch"] * 100:.1f}%',
                             f'{result["all"]["moveMatch"] * 100:.1f}%',
                             f'{player["base"]["all"]["crossEntropy"]:.3f}',
                             f'{result["all"]["crossEntropy"]:.3f}',
                             f'{result["novel"]["lossChange95"]["low"]:.3f} to {result["novel"]["lossChange95"]["high"]:.3f}'])
        opening_rows.append([name,
                             f'{player["base"]["opening"]["moveMatch"] * 100:.1f}%',
                             f'{result["opening"]["moveMatch"] * 100:.1f}%',
                             f'{player["base"]["familiar"]["moveMatch"] * 100:.1f}%',
                             f'{result["familiar"]["moveMatch"] * 100:.1f}%',
                             f'{player["base"]["novel"]["moveMatch"] * 100:.1f}%',
                             f'{result["novel"]["moveMatch"] * 100:.1f}%'])
        other = mean(other["crossEntropy"] for other in row["foreign"])
        control_rows.append([name, f'{row["own"]["crossEntropy"]:.3f}', f"{other:.3f}",
                             str(row["randomLabels"]["training"]["bestEpoch"]),
                             ", ".join(f'{rep["test"]["moveMatch"] * 100:.1f}%' for rep in row["seedReplicates"])])
        for rating, result_transfer in player["transfer"].items():
            summaries.append({"player": name, "rating": rating, "matchedRating": player["matchedRating"],
                              "baseMatch": result_transfer["base"]["moveMatch"],
                              "personalMatch": result_transfer["personal"]["moveMatch"],
                              "baseLoss": result_transfer["base"]["crossEntropy"],
                              "personalLoss": result_transfer["personal"]["crossEntropy"]})
        transfer_rows.append([name, *[
            f'{value["base"]["moveMatch"] * 100:.1f}% to {value["personal"]["moveMatch"] * 100:.1f}%'
            for value in player["transfer"].values()
        ]])
    groups = []
    for group, label in [("all", "All sampled positions"), ("opening", "Opening positions"),
                         ("familiar", "Positions seen in training games"), ("novel", "Genuinely new board inputs")]:
        groups.append([label, f'{mean(player["base"][group]["moveMatch"] for player in players) * 100:.1f}%',
                       f'{mean(player["selected"]["test"][group]["moveMatch"] for player in players) * 100:.1f}%'])
    variant_rows = []
    for variant, width, optimizer, rate in report["protocol"]["variants"]:
        variant_rows.append([str(width), optimizer.upper(), str(rate),
                             f'{mean(player["variants"][variant]["test"]["all"]["moveMatch"] for player in players) * 100:.1f}%',
                             f'{mean(player["variants"][variant]["test"]["all"]["crossEntropy"] for player in players):.3f}'])
    prefix_rows = []
    for count in ["1", "2", "4", "6"]:
        base = [follow[player["name"]]["openingPaths"]["base"][count] for player in players]
        personal = [follow[player["name"]]["openingPaths"]["personal"][count] for player in players]
        prefix_rows.append([count, f'{mean(item["greedyExactOwnMovePrefix"] for item in base) * 100:.1f}%',
                            f'{mean(item["greedyExactOwnMovePrefix"] for item in personal) * 100:.1f}%',
                            f'{mean(item["meanObservedOwnMovePrefixProbability"] for item in base) * 100:.2f}%',
                            f'{mean(item["meanObservedOwnMovePrefixProbability"] for item in personal) * 100:.2f}%'])
    curves = []
    for player in players[:4]:
        history = player["selected"]["training"]["history"]
        curves.append((player["name"], [(point["epoch"], point["validationLoss"]) for point in history]))
    own_better = sum(row["own"]["crossEntropy"] < mean(other["crossEntropy"] for other in row["foreign"])
                     for row in follow.values())
    gains = sum(player["selected"]["test"]["all"]["crossEntropy"] < player["base"]["all"]["crossEntropy"] for player in players)
    games = sum(player["sourceGames"] for player in players)
    style = """body{font:16px/1.6 system-ui,sans-serif;color:#213a43;background:#f2f6f7;margin:0}
main{max-width:1120px;margin:auto;padding:28px 20px}h1{margin-bottom:4px}h2{margin-top:0}
section{padding:18px 22px;background:white;border:2px solid #213a43;border-bottom-width:5px;border-radius:5px;margin:20px 0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #dce4e5;overflow-wrap:anywhere}
thead{background:#e8eeee}.scroll{overflow:auto}svg{width:100%;max-width:700px;display:block;margin:auto}
svg text{font:12px system-ui;fill:#213a43}.legend{text-align:center}.legend span{display:inline-block;margin:0 12px}
a{color:#365f76}.note{font-size:14px;color:#4f6881}li{margin:8px 0}@media(max-width:600px){table{min-width:650px}section{padding:14px}}"""
    page = f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DoppelMaia matched rating study</title><style>{style}</style><main><h1>DoppelMaia matched rating study</h1>'
    page += ('<section><h2>Historical source correction</h2><p>This collector did not exclude BOT accounts. '
             'These averages have not been established as human only evidence. Ratings used all partitions. '
             'The <a href="../doppelmaia-generalization-study/index.html">new audited study</a> excludes BOT titles '
             'and uses training only ratings. Its full transformer method now works in the browser.</p></section>')
    page += '<p>A closer look at learning a person\'s moves, opening habits and behavior at different rating settings.</p>'
    page += '<section><h2>What the earlier number meant</h2><p>The earlier 58.3% to 59.8% comparison used a base setting of 2000 for players whose source ratings were mostly lower. It was a rating transfer check, not a clean comparison at each player\'s own level.</p>'
    page += f'<p>This study starts each model near its own player\'s median rating, rounded to the nearest hundred. It uses {games} games from {len(players)} public players selected by activity, not by whether learning works.</p>'
    page += '<p>The new method uses all 512 frozen neural features instead of compressing them to 64. It also learns repeated opening choices and keeps the selected repertoire inside the exported model.</p></section>'
    page += '<section><h2>The main result</h2><p>These are averages that give each player equal weight. More move agreement is better. The opening and familiar position gains are larger than the gains on genuinely new boards.</p>'
    page += table(["Test group", "Untouched Maia", "Personal model"], groups)
    page += f'<p>Average prediction loss improved for {gains} of {len(players)} players. Exact move agreement did not improve for everyone. This is a useful improvement, not a claim that the engine now copies a whole person.</p></section>'
    page += '<section><h2>Each player at a similar rating</h2><p>The interval is the change in prediction loss on new board inputs. Complete games are resampled together. A range crossing zero is uncertain.</p>'
    page += table(["Player", "Setting", "Base match", "Personal match", "Base loss", "Personal loss", "New input loss change"], matched_rows) + '</section>'
    page += '<section><h2>Opening habits and new situations</h2><p>A familiar board can occur in a later game without that game having been used for training. Remembering the player\'s choices there is useful. It is not proof of generalization to a new board.</p>'
    page += table(["Player", "Opening base", "Opening personal", "Familiar base", "Familiar personal", "New base", "New personal"], opening_rows) + '</section>'
    page += '<section><h2>Does it follow the same opening path?</h2><p>These checks use every available own turn from the first 24 plies of later games. Opponent replies come from the recorded game. A prefix only counts if every one of the player\'s first choices matches. This is a replay check, not a whole game against a live opponent.</p>'
    page += table(["Own moves in a row", "Base exact path", "Personal exact path", "Base path probability", "Personal path probability"], prefix_rows)
    page += '<p>People choose different good moves from the same position. Even a faithful model should not predict every recorded choice. Comparing distributions and complete paths matters alongside the most likely move.</p></section>'
    page += '<section><h2>Lower and higher rating settings</h2><p>The exact same learned model is tested at its source setting and 400 points lower or higher. There is no new training between these checks. Each cell shows base agreement followed by personal agreement. These are conditioning settings, not measured engine ratings.</p>'
    page += table(["Player", "400 lower", "Similar rating", "400 higher"], transfer_rows) + '</section>'
    page += '<section><h2>Is it learning the person or just any games?</h2>'
    page += f'<p>Each model was also compared with the nine other people\'s adapters on the same board inputs and at the same rating. Its own prediction loss was lower than the average foreign adapter for {own_better} of {len(players)} players. This supports a person specific effect, but it does not identify a complete personality.</p>'
    page += table(["Player", "Own loss", "Other models mean loss", "Random label checkpoint", "Repeat seed match"], control_rows)
    page += '<p>The two repeat seeds use the fixed full feature SGD method. Settings are not chosen using these test results. A random label control uses real validation moves and can keep the starting model.</p></section>'
    page += '<section><h2>What was compared?</h2><p>All variants use the same training, validation and test games. The opening blend is selected using validation only. The full feature SGD variant was selected for every player by validation loss in this run.</p>'
    page += table(["Feature width", "Optimizer", "Learning rate", "Mean test match", "Mean test loss"], variant_rows)
    page += chart(curves, "Epoch", "Actual validation prediction loss") + '</section>'
    page += '<section><h2>Review the data</h2><ul>'
    for filename, label in [
        ("imitation-summary.csv", "Small spreadsheet of ratings and results"),
        ("imitation-report.json", "Settings, learning histories and every compared variant"),
        ("imitation-followup.json", "Other person controls, seed repeats, opening paths and export checks"),
        ("imitation-predictions.csv", "Every sampled test prediction"),
        ("opening-predictions.csv", "Every opening replay prediction"),
        ("human-dataset.json", "Source game links, dates and separate game groups"),
        ("Player04-personal.onnx", "Example personal Maia 3 model for Player04"),
        ("Player04-repertoire.json", "That example\'s learned opening corrections")
    ]:
        page += f'<li><a href="{filename}">{escape(label)}</a></li>'
    example_rating = next(player["matchedRating"] for player in players if player["name"] == "Player04")
    page += f'</ul><p>Load the example as Maia 3 weights and start at {example_rating}. This source player is not the current user. Models and training data can reveal playing habits.</p></section>'
    page += '<section><h2>What this does not prove</h2><p>The ten players come from one public source window. Sampling and source time controls can affect results. Models were selected using earlier games and then measured on later games. Repeated opening inputs are allowed and reported separately. Bootstrap intervals do not account for every comparison.</p>'
    page += '<p>Better prediction does not establish a measured playing rating, stronger tactics or perfect imitation. Some players still need more or different training examples. Full transformer training and more context remain future experiments, not features quietly claimed by this adapter.</p></section></main></html>'
    (args.study / "review.html").write_text(page, encoding="utf-8")
    with (args.study / "imitation-summary.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(summaries[0]))
        writer.writeheader()
        writer.writerows(summaries)
    print(args.study / "review.html")


if __name__ == "__main__":
    main()
