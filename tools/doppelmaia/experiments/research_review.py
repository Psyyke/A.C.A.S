"""Create offline reviews of training checks, audited imitation and personalities."""

import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import zipfile

from native_review import chart as learning_chart

STYLE = """*{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;background:#191919;color:#e5e2dc;max-width:1180px;margin:32px auto;padding:0 16px}
h1,h2,h3{line-height:1.25}h1{color:#dfc67e}h2{margin-top:36px}a{color:#dfc67e}p,li{overflow-wrap:anywhere}
.card,details{background:#242424;border:1px solid #444;border-radius:12px;padding:18px;margin:18px 0}
.tables{overflow-x:auto;max-width:100%}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px;border-bottom:1px solid #444}
th{color:#dfc67e}small{color:#b9b5ac}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:16px}
svg{width:100%;max-width:560px;height:auto}svg text{fill:#bbb;font:18px system-ui}svg path{stroke-opacity:.3}.legend span{margin-right:12px}
summary{cursor:pointer}code{overflow-wrap:anywhere}.warning{border-left:4px solid #dfc67e;padding-left:16px}
@media(max-width:600px){body{font-size:14px}th,td{padding:7px}.card{padding:12px}}"""


def page(title, body):
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f"<title>{html.escape(title)}</title><style>{STYLE}</style><main><h1>{html.escape(title)}</h1>{body}</main></html>")


def table(headings, rows):
    return ('<div class="tables" role="region" aria-label="Measured results" tabindex="0"><table><thead><tr>'
            + "".join(f"<th>{html.escape(value)}</th>" for value in headings) + "</tr></thead><tbody>"
            + "".join("<tr>" + "".join(f"<td>{value}</td>" for value in row) + "</tr>" for row in rows)
            + "</tbody></table></div>")


def percent(value):
    return f"{100 * value:.2f}%"


def interval(value):
    return f"{100 * value['mean']:+.2f} pp<br><small>{100 * value['low']:+.2f} to {100 * value['high']:+.2f}</small>"


def chart(history, best_epoch, name):
    series = [(label, [(row["epoch"], row[field]) for row in history])
              for label, field in [("Training", "trainLoss"), ("Novel validation", "validationLoss")]]
    return learning_chart(series, "Epoch", name + " cross entropy",
                          colors=["#dfc67e", "#89bfdb"], marker=best_epoch)


def generalization(study, dataset=None):
    report = json.loads((study / "generalization-report.json").read_text())
    sources = {}
    for name, expected in report["protocol"]["sourceSHA256"].items():
        sources[name] = Path(__file__).with_name(name).read_bytes()
        if hashlib.sha256(sources[name]).hexdigest() != expected:
            raise ValueError(f"{name} changed since the executed study")
    pending = study / "reproduction-source.pending.zip"
    with zipfile.ZipFile(pending, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in sources.items():
            archive.writestr("tools/doppelmaia/experiments/" + name, content)
        for name in ["native-requirements.txt", "finetune_LICENSE.txt"]:
            archive.writestr("tools/doppelmaia/experiments/" + name, Path(__file__).with_name(name).read_bytes())
        archive.writestr("protocol.json", json.dumps(report["protocol"], indent=2))
    pending.replace(study / "reproduction-source.zip")
    strict = report["summary"]["strictNovel"]
    players = report["players"]
    source_text = "Training games precede validation and untouched tests in the local Lichess archive."
    if dataset:
        raw = dataset.read_bytes()
        if hashlib.sha256(raw).hexdigest() != report["protocol"]["datasetSHA256"]:
            raise ValueError("Review dataset does not match the executed study")
        source = json.loads(raw)
        source_text = (f'It scans {source["scannedGames"]:,} local Lichess games. Training uses the first '
                       f'{source["trainingArchiveCutoff"]:,} archive rows. Later games supply validation and untouched tests.')
    labels = {"base": "Starting Maia 3", "frozen-tanh": "Frozen tanh adapter, 6000 moves",
              "full-6000": "Full transformer, 6000 moves", "full-all": "Full transformer, all moves",
              "full-personal": "Full transformer, no base anchor", "full-faster": "Full transformer, rate 0.00003",
              "selected": "Validation selected full model", "base-plus200": "Starting Maia 3, Elo input +200",
              "selected-plus200": "Selected model, Elo input +200", "wrong-player": "Another account's selected model",
              "random-labels": "Random labels, first eligible account only"}
    body = ('<p class="warning">Earlier comparisons included BOT accounts. Five of the six accounts in the old full model study '
            'were bots. Nine of the twenty accounts in the old adapter study were bots. Those numbers were not human only evidence.</p>'
            f'<p>This study uses {len(players)} accounts without a BOT title in the collected source PGNs. {source_text} '
            'Actual UTC ordering and every source hash are checked. Only standard games with normal termination are included.</p>'
            '<p>Agreement means predicting the recorded move. It is not a percentage of personality copied, a playing strength rating or a guarantee on future games.</p>'
            '<h2>Strictly unseen boards</h2><p>These board inputs appear in neither training nor validation. Every method uses the same test boards. '
            'Rates are pooled over positions. The JSON also includes equal account means. Intervals resample whole source games, '
            'not independent moves. They describe this activity selected group.</p>')
    body += table(["Method", "Moves", "Move agreement", "Cross entropy", "Gain over base and 95% interval"],
        [[html.escape(labels[name]), str(row["positions"]), percent(row["moveMatch"]), f'{row["crossEntropy"]:.5f}',
          interval(row["top1Change95"])] for name, row in strict.items()])
    body += '<h2>Each account and its portable model</h2>'
    rows = []
    for player in players:
        selected = next(row for row in player["selection"]["candidates"] if row["id"] == player["selected"])
        before, after = player["methods"]["base"]["strictNovel"], player["methods"]["selected"]["strictNovel"]
        name = html.escape(player["name"])
        link = f'<a href="{name}/{html.escape(selected["export"])}" download>{name} ONNX</a>'
        rows.append([link, str(player["elo"]), str(player["counts"]["train"]), str(after["positions"]),
                     percent(before["moveMatch"]), percent(after["moveMatch"]), str(selected["bestEpoch"])])
    body += table(["Model download", "Elo input", "Training moves", "Unseen test moves", "Before", "After", "Chosen epoch"], rows)
    body += ('<p>Models are about 91 MB each. Upload one in A.C.A.S Maia 3 Weights and use its recorded Elo input first. '
             'The shared transformer changes value estimates too. These models are not strength rated or WDL calibrated.</p>'
             '<h2>Actual learning curves</h2><p>Gold is training loss. Blue is novel validation loss. The dotted line marks the exported checkpoint. '
             'The first point is the unchanged model.</p><div class="grid">')
    for player in players:
        candidate = next(row for row in player["selection"]["candidates"] if row["id"] == player["selected"])
        body += (f'<section class="card"><h3>{html.escape(player["name"])}</h3>'
                 + chart(candidate["history"], candidate["bestEpoch"], player["name"])
                 + f'<p>{html.escape(labels[candidate["id"]])}. {candidate["updates"]} optimizer updates.</p>'
                 + f'<a href="{html.escape(player["name"])}/predictions.csv" download>Every test prediction</a></section>')
    body += '</div><h2>Familiarity and opening checks</h2>'
    body += table(["Boards", "Moves", "Starting agreement", "Selected agreement"],
        [[group, str(values["selected"]["positions"]), percent(values["base"]["moveMatch"]), percent(values["selected"]["moveMatch"])]
         for group, values in report["summary"].items() if "selected" in values])
    body += ('<h2>How to read this</h2><ul><li>The method is the browser full transformer, with the same targets, shuffle, AdamW and checkpoint rule. '
             'The experiment tries four fixed settings on validation. The page does not run that search automatically.</li>'
             '<li>The frozen comparison uses the correct tanh features. It has no opening lookup and is selected on the same novel validation boards.</li>'
             '<li>Wrong account models and random training labels are controls. They are not excluded just because they look unfavorable.</li>'
             '<li>Changing the Elo input by 200 measures conditioning transfer. It does not show that playing strength rose by 200.</li>'
             '<li>The shipped model sees the current board repeated eight times and fixed clock features. It does not see the actual clock or full game history.</li>'
             '</ul><h2>Reproduction files</h2><ul><li><a href="protocol.json">Fixed protocol and source audit</a></li>'
             '<li><a href="validation-selections.json">Every validation decision made before testing</a></li>'
             '<li><a href="generalization-report.json">Full numeric report and game intervals</a></li>'
             '<li><a href="reproduction-source.zip" download>Exact executed Python sources and license</a></li>'
             '<li><a href="../../tools/doppelmaia/experiments/finetune_README.md">Commands and architecture notes</a></li></ul>')
    (study / "index.html").write_text(page("DoppelMaia audited player study", body), encoding="utf-8")


def workflow(study):
    case = json.loads((study / "workflow.json").read_text())
    native = json.loads((study / "cuda-report.json").read_text())
    browser = json.loads((study / "browser-report.json").read_text())
    difference = json.loads((study / "workflow-parity.json").read_text())
    body = (f'<p>The actual browser worker trained all eight Maia 3 transformer blocks and '
            f'{browser["trainableParameters"]:,} parameters. It did not import an already trained CUDA model.</p>'
            f'<p>The fixture has {len(case["dataset"]["train"]["samples"]):,} training positions and '
            f'{len(case["dataset"]["validation"]["samples"]):,} validation positions, including '
            f'{native["novelValidationPositions"]:,} inputs absent from training.</p>'
            '<p class="warning">This checks numerical implementation agreement. These are validation scores, '
            'not an untouched human imitation benchmark or a percentage of personality copied.</p>')
    body += table(["Implementation", "Updates", "Chosen epoch", "Selected novel CE", "Validation move match", "Training and evaluation seconds"],
        [[name, str(result["updates"]), str(result["bestEpoch"]), f'{result["exportedObjectiveLoss"]:.7f}',
          percent(result["exportedMetrics"]["accuracy"]), f"{seconds:.2f}"]
         for name, result, seconds in [("Browser WebGPU", browser, browser["trainingMilliseconds"] / 1000),
                                       ("Native CUDA graphs", native, native["seconds"])]])
    body += ('<h2>Actual validation learning</h2>'
             + learning_chart([(name, [(point["epoch"], point["validationLoss"]) for point in result["history"]])
                               for name, result in [("Browser WebGPU", browser), ("Native CUDA", native)]],
                              "Epoch", "Novel validation cross entropy", colors=["#dfc67e", "#89bfdb"],
                              marker=browser["bestEpoch"])
             + f'<p>Selected loss differs by {difference["selectedCEDifference"]:.8f}. '
             f'Exported validation move agreement differs by {100 * difference["heldOutAgreementDifference"]:.4f} '
             'percentage points. Separate longer checks found larger differences in learned weights and some move probabilities. '
             'This is not bit identical training. The implementation guide records those limits.</p>'
             '<h2>Models and exact records</h2><ul>'
             '<li><a href="browser.onnx" download>Actual browser trained ONNX model</a></li>'
             '<li><a href="cuda.onnx" download>Native CUDA reference model</a></li>'
             '<li><a href="workflow.json">Exact input positions and settings</a></li>'
             '<li><a href="browser-report.json">Browser training report</a></li>'
             '<li><a href="cuda-report.json">Native training report</a></li>'
             '<li><a href="workflow-parity.json">Every epoch comparison</a></li>'
             '<li><a href="../../tools/doppelmaia/experiments/finetune_README.md">Training implementation and numerical limits</a></li></ul>')
    (study / "index.html").write_text(page("DoppelMaia browser and CUDA training check", body), encoding="utf-8")


def personalities(study, fresh):
    report = json.loads((study / "curation-report.json").read_text())
    if not report["confirmed"]:
        raise ValueError("Finish the fresh-game confirmation before publishing a curated catalog")
    games = json.loads((fresh / "personality-rollouts.json").read_text())
    outcomes = {row["id"]: row["outcomes"]["personal"] for row in games["profiles"]}
    selected = [row for row in report["profiles"] if row["id"] in report["selected"]]
    body = (f'<p>Explored {report["protocol"]["candidateCount"]} candidates. Kept {len(selected)} with a visible, consistent preference and distinct measured policies. '
            'There was no target catalog size.</p><p>All common board comparisons use Elo input 1500, so a different Elo cannot masquerade as a different personality. '
            'Six new opening groups and both colors provide a separate autonomous game check.</p>'
            '<p class="warning">These are entertaining move preferences, not complete human personalities or proven playing ratings. '
            'A high starting Elo is not evidence that an unusual style remains strong.</p><h2>The curated collection</h2>')
    rows = []
    for row in selected:
        identifier = row["id"]
        changes = sorted(row["confirmation"]["chosenTraitChange"].items(), key=lambda item: -abs(item[1]))[:3]
        description = ", ".join(f"{html.escape(name)} {value:+.3f}" for name, value in changes)
        result = outcomes[identifier]
        score = f'{result["wins"]} / {result["draws"]} / {result["losses"]} / {result["unfinished"]}'
        game_link = f'<a href="../{html.escape(fresh.name)}/{html.escape(identifier)}-games.pgn" download>{html.escape(row["name"])}</a>'
        rows.append([game_link, str(row["elo"]), percent(row["baseDeparture"]["topMoveDisagreement"]),
                     description, score])
    body += table(["Personality and PGN", "Starting Elo input", "Moves changed from common base", "Actual chosen move differences", "W / D / L / unfinished"], rows)
    body += ('<p>Trait differences compare paired personal and base games on the fresh openings. Each complete game gets equal weight. '
             'Numbers use the shared normalized move features. Piece choices and captures are frequencies, while distance and shelter are scores. '
             'Unfinished games are not counted as draws.</p>'
             '<h2>Selection rules</h2><ul><li>At least 20% changed top moves and mean policy Jensen Shannon distance of 0.025 from the common base.</li>'
             '<li>Every retained pair differs on at least 15% of top moves, with a game clustered lower 95% bound of 10% and mean JS of at least 0.02.</li>'
             '<li>The chosen move preference has a positive paired opening interval and the intended direction in at least 75% of opening groups.</li>'
             '<li>Simpler descriptions are considered first. Similar variants are merged rather than added to fill a quota.</li></ul>'
             '<p>The old held out boards now also help select this catalog. That part is exploratory, not a new independent test. '
             'Fresh games confirm the selected behavior without changing the preset weights. Intervals are nominal, '
             'not a simultaneous guarantee across all candidates. Human recognition has not been measured.</p>'
             '<h2>All candidates remain visible in the evidence</h2>')
    body += table(["Candidate", "Published", "Why it was not kept"],
        [[html.escape(row["name"]), "Yes" if row["id"] in report["selected"] else "No",
          html.escape(". ".join(row["reasons"]))] for row in report["profiles"]])
    body += ('<h2>Review and reproduce</h2><ul><li><a href="curation-report.json">Full curation report</a></li>'
             '<li><a href="pairwise-policies.json">Every pairwise policy comparison</a></li>'
             '<li><a href="confirmation-signatures.json">Whole game signatures</a></li>'
             '<li><a href="../../tools/doppelmaia/README.md">Training method and commands</a></li></ul>')
    (study / "index.html").write_text(page("DoppelMaia personality collection", body), encoding="utf-8")


def contextual(study):
    root = study.parent
    report = json.loads((study / "study-report.json").read_text())
    with (study / "predictions.csv").open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != report["predictionsSHA256"]:
            raise ValueError("The published test predictions changed")
    if hashlib.sha256((study / "frozen-selections.json").read_bytes()).hexdigest() != report["selectionSHA256"]:
        raise ValueError("Validation selections changed after test evaluation")
    browser = json.loads((root / "workflow" / "browser-report.json").read_text())
    native = json.loads((root / "workflow" / "cuda-report.json").read_text())
    parity = json.loads((root / "workflow" / "workflow-parity.json").read_text())
    gradients = json.loads((root / "parity" / "browser-parity.json").read_text())
    app = json.loads((study / "browser-parity.json").read_text())
    if browser["tokenChannels"] != 96 or gradients["tokenChannels"] != 96 or not browser["exportVerified"]:
        raise ValueError("The context-specific browser checks are missing")
    if len(gradients["gradients"]) != 154:
        raise ValueError("The context gradient check is incomplete")
    if {row["name"] for row in app} != {row["name"] for row in report["players"]} or any(
            row["tokenChannels"] != 96 or not row["applicationWorker"] for row in app):
        raise ValueError("Every selected contextual model must pass actual app inference")
    for row in app:
        player = next(player for player in report["players"] if player["name"] == row["name"])
        if row["modelSHA256"] != player["selection"]["context"]["sha256"]:
            raise ValueError("App checks refer to a different selected model")
        if not row.get("heldOut") or row["heldOut"]["positions"] != player["metrics"]["strictNovel"]["selected"]["positions"]:
            raise ValueError("App checks must cover the entire strict unseen test set")
    strict = report["aggregate"]["strictNovel"]
    players = report["players"]
    labels = {"base": "Starting Maia 3", "context-base": "Starting Maia 3 with real history",
              "previous-personal": "Previous personalized models",
              "matched-repeated": "Old input method with the larger training set",
              "selected": "New contextual personalized models",
              "selected-plus200": "New models with Elo input raised by up to 200",
              "wrong-person": "Another account's new model"}
    training = sum(row["counts"]["train"] for row in players)
    test = sum(row["counts"]["test"] for row in players)
    windows = report["protocol"]["windows"]
    body = (f'<p>Scanned {windows["testEnd"]:,} local Lichess games. The new comparison uses {len(players)} accounts, '
            f'{training:,} personal training moves and {test:,} later test moves. '
            f'{strict["selected"]["positions"]:,} test moves are on boards absent from that account\'s training, validation and earlier development data. '
            'This does not certify novelty against other accounts or Maia\'s pretraining.</p>'
            '<p class="warning">Move agreement means predicting the recorded move. It is not a percentage of personality copied. '
            'These results do not establish an 80% generalization rate or a playing strength rating.</p>'
            '<h2>The same fresh boards for every method</h2>'
            '<p>The previous models are evaluated again on this new test window. Comparing these paired rows is meaningful. '
            'Subtracting a percentage from an earlier study with different boards or accounts is not.</p>')
    body += table(["Method", "Move agreement", "Cross entropy", "Gain over previous personal models"],
        [[html.escape(label), percent(strict[name]["moveMatch"]), f'{strict[name]["crossEntropy"]:.5f}',
          interval(strict[name]["paired"]["previous-personal"])] for name, label in labels.items()])
    body += ('<p>Intervals use 2000 paired draws of original source games, including games shared by two accounts. '
             'They describe this selected group, not all chess players. The JSON also includes equal account means.</p>')
    gain = strict["selected"]["paired"]["matched-repeated"]
    body += (f'<p>Against the same training data with the old repeated board input, the new method gains '
             f'{100 * gain["mean"]:.2f} percentage points. Its 95% interval runs from '
             f'{100 * gain["low"]:.2f} to {100 * gain["high"]:.2f}.</p>'
             '<h2>Each account and its model</h2>')
    links, curves = [], []
    for player in players:
        selected = player["selection"]["context"]
        path = Path(selected["path"])
        with path.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != selected["sha256"]:
                raise ValueError("A downloadable selected model changed")
        candidate = json.loads(path.with_suffix(".json").read_text())
        href = html.escape(os.path.relpath(path, study).replace("\\", "/"), quote=True)
        name, metric = html.escape(player["name"]), player["metrics"]["strictNovel"]
        links.append([f'<a href="{href}" download>{name} ONNX</a>', str(player["elo"]),
            f'{player["counts"]["train"]:,}', f'{metric["selected"]["positions"]:,}',
            percent(metric["previous-personal"]["moveMatch"]), percent(metric["selected"]["moveMatch"])])
        curves.append(f'<section class="card"><h3>{name}</h3>'
            + chart(candidate["history"], candidate["bestEpoch"], player["name"])
            + f'<p>{html.escape(selected["id"])}. Selected epoch {selected["bestEpoch"]}. '
              f'{candidate["updates"]:,} real optimizer updates.</p></section>')
    body += table(["Model download", "Elo input", "Training moves", "Unseen test moves", "Previous", "New"], links)
    body += ('<p>These are complete 96 channel Maia 3 ONNX networks, about 91 MB each. Upload them in the app as Maia 3 weights. '
             'The app supplies its observed move history. A standalone FEN pads unknown earlier frames. '
             'Shared transformer changes also affect value estimates. No strength or WDL calibration is claimed.</p>'
             '<h2>Actual learning curves</h2><p>Gold is training loss. Blue is validation loss on boards absent from training. '
             'The dotted line marks the exported checkpoint.</p><div class="grid">' + "".join(curves) + '</div>')
    body += '<h2>Why this method was chosen</h2>'
    pilot = json.loads((root / "pilot-v2" / "development-results.json").read_text())
    grouped = {}
    for row in pilot["results"]:
        candidate = json.loads((root / "pilot-v2" / row["player"] / f'{row["id"]}.json').read_text())
        count = candidate["novelValidationPositions"]
        point = candidate["history"][candidate["bestEpoch"]]
        totals = grouped.setdefault(row["id"], [0, 0., 0.])
        totals[0] += count
        totals[1] += count * point["validationAccuracy"]
        totals[2] += count * point["validationLoss"]
    body += ('<p>Six adaptation strategies were compared on three predefined development accounts. '
             'These are validation results from the earlier window, not fresh test scores.</p>')
    body += table(["Development method", "Novel moves", "Move agreement", "Cross entropy"],
        [[html.escape(name), str(count), percent(accuracy / count), f'{loss / count:.5f}']
         for name, (count, accuracy, loss) in grouped.items()])
    released = root / "released-pilot-v2"
    if released.exists():
        protocol = json.loads((released / "protocol.json").read_text())
        rows = [json.loads(path.read_text()) for path in sorted(released.glob("Player*.json"))]
        if len(rows) != len(protocol["players"]) * len(protocol["rates"]):
            raise ValueError("Finish the declared larger-model pilot before publishing its comparison")
        body += ('<p>The released 79M network was also fully fine tuned on one development account. '
                 'These exploratory runs used batch 16 rather than the smaller pilot model\'s batch 32. '
                 'They are not a controlled model size comparison or a browser feature.</p>')
        body += table(["Account", "Learning rate", "Chosen epoch", "Novel agreement", "Novel CE"],
            [[html.escape(row["player"]), str(row["options"]["learningRate"]), str(row["bestEpoch"]),
              percent(row["history"][row["bestEpoch"]]["validationAccuracy"]),
              f'{row["exportedObjectiveLoss"]:.5f}'] for row in rows])
    body += ('<h2>Browser and CUDA checks</h2>'
             f'<p>The context workflow trained {native["trainPositions"]:,} positions and validated on '
             f'{native["validationPositions"]:,} positions. Browser and CUDA selected epochs '
             f'{browser["bestEpoch"]} and {native["bestEpoch"]}. The selected CE difference was '
             f'{parity["selectedCEDifference"]:.7f} and validation agreement differed by '
             f'{100 * parity["heldOutAgreementDifference"]:.4f} percentage points.</p>')
    body += table(["Check", "Measured difference"],
        [["Initial policy logits", f'{gradients["baseline"]["policy"]["maximum"]:.8f}'],
         ["All 154 parameter gradients", f'{max(row["maximum"] for row in gradients["gradients"]):.8f}'],
         ["Four update top move agreement", percent(gradients["final"]["moveAgreement"])],
         ["Selected models in the actual app", f'{max(error["policyMaximumAbsoluteError"] for row in app for error in row["errors"]):.8f}']])
    app_positions = sum(row["heldOut"]["positions"] for row in app)
    app_matches = sum(row["heldOut"]["matches"] for row in app)
    differences = sum(len(row["heldOut"]["differences"]) for row in app)
    body += (f'<p>The actual app WebGPU worker also replayed all {app_positions:,} strictly unseen boards. '
             f'Its human move agreement was {percent(app_matches / app_positions)}. '
             f'Browser and native top predictions differed on {differences} boards. '
             'Both loaded the same CUDA trained weights. The independent browser training check is above. '
             'The per model JSON records every disagreement.</p>')
    body += ('<p>FP32 runs are not bit identical. The older long stress check and its larger numerical differences remain documented. '
             'The packed WebGPU matrix multiplication setting stays enabled.</p>'
             '<h2>Source and selection audit</h2>'
             f'<p>Training ends at archive row {windows["trainEnd"]:,}. Validation ends at {windows["validationEnd"]:,}. '
             f'Test games end at {windows["testEnd"]:,}. All accounts share these boundaries. '
             'Every prepared board, history frame, target move and legal mask was replayed against its original source PGN.</p>'
             '<p>The cohort was fixed before these results. Two earlier accounts lacked enough later activity and were not replaced. '
             'Retained accounts have no BOT title in the source files. That is not independent proof of human identity. '
             'Models and validation selections were hashed and frozen before test inference.</p>'
             '<h2>Review and reproduce</h2><ul>'
             '<li><a href="study-report.json">Complete metrics and paired intervals</a></li>'
             '<li><a href="predictions.csv" download>Every test prediction</a></li>'
             '<li><a href="frozen-selections.json">Frozen settings and model hashes</a></li>'
             '<li><a href="source-audit.json">Complete source audit</a></li>'
             '<li><a href="source.zip" download>Executed evaluation source</a></li>'
             '<li><a href="../training/source.zip" download>Executed training source</a></li>'
             '<li><a href="../data/human-dataset.json" download>Research dataset with all three splits</a></li>'
             '<li><a href="../workflow/workflow-parity.json">Every browser and CUDA epoch</a></li>'
             '<li><a href="../parity/browser-parity.json">Every parameter gradient comparison</a></li>'
             '<li><a href="browser-parity.json">Selected models in the actual app</a></li>'
             '<li><a href="../../../tools/doppelmaia/experiments/finetune_README.md">Implementation and reproduction commands</a></li></ul>')
    (study / "index.html").write_text(page("DoppelMaia fresh unseen move study", body), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=["generalization", "personalities", "workflow", "context"])
    parser.add_argument("study", type=Path)
    parser.add_argument("--fresh", type=Path)
    parser.add_argument("--dataset", type=Path)
    args = parser.parse_args()
    if args.kind == "generalization":
        generalization(args.study, args.dataset)
    elif args.kind == "workflow":
        workflow(args.study)
    elif args.kind == "context":
        contextual(args.study)
    elif args.fresh:
        personalities(args.study, args.fresh)
    else:
        raise ValueError("Personality review needs the fresh autonomous games directory")


if __name__ == "__main__":
    main()
