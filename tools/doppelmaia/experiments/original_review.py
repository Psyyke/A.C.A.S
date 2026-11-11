"""Generate a standalone offline reviewer for the measured original-Lc0 study."""

import argparse
import csv
import html
import json
from pathlib import Path


def render(directory: Path):
    report = json.loads((directory / "report.json").read_text())
    dataset = json.loads((directory / "dataset.json").read_text())
    rows = []
    predictions = {}
    for model in report["models"]:
        before, after = model["baseline"]["test"], model["exported"]["test"]
        rows.append(f"<tr><td>{html.escape(model['model'])}</td><td>{before['accuracy']:.2%}</td>"
                    f"<td>{after['accuracy']:.2%}</td><td>{before['loss']:.4f}</td><td>{after['loss']:.4f}</td>"
                    f"<td>{model['bestEpoch']}</td><td>{model['seconds']['training']:.3f}</td>"
                    f"<td>{max(model['parity'].values()):.2e}</td></tr>")
        with (directory / model["model"] / "test-predictions.csv").open(newline="") as stream:
            predictions[model["model"]] = list(csv.DictReader(stream))
    sources = {game["id"]: game["source"] for game in dataset["games"]}
    payload = json.dumps({"predictions": predictions, "sources": sources}).replace("<", "\\u003c")
    document = """<!doctype html><meta charset="utf-8"><title>Original Maia CUDA comparison</title>
<style>body{font:15px system-ui;max-width:1100px;margin:2em auto;padding:1em;background:#131821;color:#e5e9f0}
table{border-collapse:collapse;width:100%}td,th{padding:.5em;border-bottom:1px solid #394353;text-align:left}
a{color:#8ac8ff}code{overflow-wrap:anywhere}select{font:inherit;padding:.4em}</style>
<h1>Original Maia: native CUDA / actual JS parity</h1>
<p><b>Historical source qualification</b>. These source accounts were not audited for BOT titles.
This remains a numerical implementation check, not established human only imitation evidence.</p>
<p>Ten bundled original Maia networks and TinyGyal, frozen tower/value, final policy-convolution SGD.
Shared archive data: 256 train / 64 validation / 128 test moves, game-separated, history8.
Pooled players: this is <b>not</b> evidence of single-player style, playing strength, or near-perfect imitation.</p>
<p>Settings: maximum 10 epochs, patience 3, batch 16, learning rate .005, momentum .9,
gradient norm clip 5, decay .0001 toward the initial head. Validation selects the checkpoint;
the test set is never used for selection. LINEAR16 export reverts to baseline if validation improvement is lost.</p>
<table><thead><tr><th>Starting model</th><th>Before agreement</th><th>Export agreement</th>
<th>Before CE</th><th>Export CE</th><th>Best epoch</th><th>CUDA train seconds</th><th>Max parity error</th>
</tr></thead><tbody>ROWS</tbody></table>
<h2>Verification</h2><p>GPU: DEVICE. Native CUDA is mandatory; CPU EP fallback is disabled.
Browser WASM is a separate numerical reference. Original/exported ONNX files pass the ONNX checker.
Every model's complete real-data JS training history and selected weights are compared with CUDA.
A 12-update clipped stress fixture compares every batch and rejects missing momentum, clipping, or base decay.</p>
<p>Dataset SHA256: <code>FINGERPRINT</code>. Small, noisy holdouts; unchanged exports mean
validation rejected the trained head, not a missing training run. No cross-model feature equivalence is assumed.</p>
<h2>Inspect the untouched test predictions</h2><select id="model"></select>
<table><thead><tr><th>Source game</th><th>Ply</th><th>Recorded move</th><th>Before</th><th>Export</th></tr></thead>
<tbody id="predictions"></tbody></table>
<script>const data=PAYLOAD;const select=document.querySelector('#model');
for(const name of Object.keys(data.predictions)){const option=document.createElement('option');option.textContent=name;select.append(option)}
function render(){const body=document.querySelector('#predictions');body.replaceChildren();
for(const row of data.predictions[select.value]){const tr=document.createElement('tr');
for(const value of [data.sources[row.gameId]||row.gameId,row.ply,row.target,row.before,row.after]){
const td=document.createElement('td');td.textContent=value;tr.append(td)}body.append(tr)}}select.onchange=render;render();</script>"""
    document = document.replace("ROWS", "".join(rows)).replace("DEVICE", html.escape(report["device"]))
    if report.get("player"):
        counts = report["splitPositions"]
        document = document.replace("Ten bundled original Maia networks and TinyGyal",
                                    "Original Maia1500 and TinyGyal")
        document = document.replace("256 train / 64 validation / 128 test",
                                    f"{counts['train']} train / {counts['validation']} validation / {counts['test']} test")
        document = document.replace("Pooled players: this is <b>not</b> evidence of single-player style, playing strength, or near-perfect imitation.",
                                    f"One anonymized player ({html.escape(report['player'])}, median rating {report['medianRating']}. "
                                    "This is a single-player held-out study, not proof of general style transfer, strength, or near-perfect imitation.")
        document = document.replace("all eleven measured result rows", "both measured result rows")
    document = document.replace("FINGERPRINT", report["datasetSha256"]).replace("PAYLOAD", payload)
    (directory / "review.html").write_text(document, encoding="utf-8")
    with (directory / "summary.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["model", "testAgreementBefore", "testAgreementExport", "testCEBefore", "testCEExport",
                         "bestEpoch", "featureSeconds", "trainingSeconds", "totalSeconds"])
        for model in report["models"]:
            before, after = model["baseline"]["test"], model["exported"]["test"]
            writer.writerow([model["model"], before["accuracy"], after["accuracy"], before["loss"], after["loss"],
                             model["bestEpoch"], model["seconds"]["features"], model["seconds"]["training"],
                             model["seconds"]["total"]])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    render(parser.parse_args().directory)
