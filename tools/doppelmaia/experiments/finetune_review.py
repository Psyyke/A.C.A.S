"""Produce a self-contained offline HTML view of the executed fine-tuning study."""

import argparse
import hashlib
import html
from importlib.metadata import PackageNotFoundError, version
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path)
    args = parser.parse_args()
    report = json.loads((args.study / "finetune-report.json").read_text())
    historical = report["protocol"]["version"] < 3
    dependencies = {}
    for package in ["torch", "onnx", "onnxruntime-gpu", "numpy", "python-chess"]:
        try:
            dependencies[package] = version(package)
        except PackageNotFoundError:
            dependencies[package] = "not installed in review environment"
    manifest = {"meaning": "Review environment and current files, not necessarily the historical execution source.",
                "dependencies": dependencies,
                "files": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                          for path in Path(__file__).parent.glob("finetune_*") if path.is_file()},
                "datasetSHA256": report["protocol"]["datasetSHA256"],
                "modelSHA256": report["protocol"]["modelSHA256"]}
    (args.study / "reproduction-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    rows = []
    summary = {}
    for group in ["all", "novel", "strictNovel", "familiar", "opening"]:
        summary[group] = {}
        for method in ["base", "adapter", "partial", "full", "selected", "random-label-control"]:
            measurements = []
            for player in report["players"]:
                if method == "base":
                    values = player["base"]
                elif method == "adapter":
                    values = next(a["test"] for a in player["adapters"] if a["anchor"] == player["selectedAdapterAnchor"])
                else:
                    candidates = [c for c in player["candidates"] if
                                  (c["id"] == player["selected"] if method == "selected" else
                                   c.get("randomLabels", False) if method == "random-label-control" else
                                   not c.get("randomLabels") and c["blocks"] == (1 if method == "partial" else 8))]
                    candidate = min(candidates, key=lambda c: c["selectedNovelValidationCE"])
                    values = candidate["test"]
                if group in values:
                    measurements.append(values[group])
            count = sum(m["positions"] for m in measurements)
            if count:
                summary[group][method] = {"positions": count,
                                         "crossEntropy": sum(m["positions"] * m["crossEntropy"] for m in measurements) / count,
                                         "moveMatch": sum(m["positions"] * m["moveMatch"] for m in measurements) / count}
                value = summary[group][method]
                label = ("raw pooled adapter" if historical else "tanh feature adapter") if method == "adapter" else method
                rows.append(f"<tr><td>{group}</td><td>{label}</td><td>{count}</td>"
                            f"<td>{value['crossEntropy']:.5f}</td><td>{100 * value['moveMatch']:.2f}%</td></tr>")
    (args.study / "finetune-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    correction = (
        "<p><b>Historical source correction</b>. Five of the six accounts in the original published run had BOT titles, "
        "including three Maia bots. Its averages are not human only imitation evidence. Its frozen comparator also used "
        "raw pooled features, not the browser adapter's tanh features. Saved numerical results are retained with these corrections.</p>"
        if historical else
        "<p>This legacy runner does not independently audit source account titles. Use the audited workflow below "
        "before interpreting a cohort as human only evidence.</p>"
    )
    document = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maia3 native fine-tuning study</title>
<style>*{box-sizing:border-box}body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 12px;background:#111827;color:#eee;overflow-wrap:anywhere}
.table-scroll{max-width:100%;overflow-x:auto}table{border-collapse:collapse;width:100%}td,th{padding:9px;border-bottom:1px solid #475569;text-align:left}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%}summary{cursor:pointer}a{color:#93c5fd;overflow-wrap:anywhere}</style>
<h1>Maia3 native transformer fine-tuning</h1>
""" + correction + """
<p>Full transformer training now works in the browser. See the
<a href="../../tools/doppelmaia/experiments/finetune_README.md">current implementation and verification guide</a>
and the <a href="../doppelmaia-generalization-study/index.html">audited larger account study</a>.</p>
<p>This historical experiment ran on CUDA. Checkpoints and learning rates use
novel validation cross-entropy, never test results. No opening memory. Agreement is observed move
prediction, not guaranteed reproduction or a measured playing-strength Elo.</p>
<p>Novel excludes training board inputs. StrictNovel additionally excludes validation board inputs.
All methods use exactly the same chronological source game splits. Lower CE and higher agreement are better.
Partial and full rows independently select learning rate by novel validation CE.</p>
<div class="table-scroll" role="region" aria-label="Fine-tuning results" tabindex="0"><table><tr><th>Boards</th><th>Method</th><th>N</th><th>Cross-entropy</th><th>Agreement</th></tr>"""
    document += "".join(rows) + "</table></div><h2>Portable models</h2><ul>"
    for player in report["players"]:
        name = html.escape(player["name"])
        chosen = next(c for c in player["candidates"] if c["id"] == player["selected"])
        document += (f'<li><a href="{name}/maia3-finetuned.onnx" download>{name} ONNX</a> '
                     f'with strictly unseen agreement {100 * chosen["test"]["strictNovel"]["moveMatch"]:.2f}%, '
                     f'CE {chosen["test"]["strictNovel"]["crossEntropy"]:.5f}</li>')
    document += """</ul><p>Each model is approximately 91 MB. Shared transformer training changes value logits.
Playing strength and WDL calibration are not established. Architecture adapted from CSSLab Maia3
under <a href="../../tools/doppelmaia/experiments/finetune_LICENSE.txt">AGPL version 3</a>.
Existing model and weight licensing also applies.</p>
<details><summary>Full protocol, paired game intervals and value-head drift</summary><pre>"""
    document += html.escape(json.dumps(report, indent=2)) + "</pre></details>"
    for filename, title in [("finetune-followup.json", "Wrong-player controls, rating transfer and input ambiguity"),
                            ("browser-parity.json", "Actual application WebGPU worker parity")]:
        path = args.study / filename
        if path.exists():
            document += f"<details><summary>{title}</summary><pre>"
            document += html.escape(path.read_text(encoding="utf-8")) + "</pre></details>"
    (args.study / "index.html").write_text(document, encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
