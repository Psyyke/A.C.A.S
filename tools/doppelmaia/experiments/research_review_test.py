"""Check contextual review output and its artifact identity guards."""

import copy
import json
from pathlib import Path
import tempfile
import unittest

from research_review import contextual
from unseen_data import digest


class ContextReviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="acas-context-review-")
        self.root = Path(self.temporary.name)
        self.study = self.root / "evaluation"
        self.study.mkdir()
        self.model = self.root / "training" / "Fixture" / "full-history.onnx"
        self.model.parent.mkdir(parents=True)
        self.model.write_bytes(b"Renderer fixture, not a neural network")
        checkpoint = {"id": "full-history", "path": str(self.model), "sha256": digest(self.model), "bestEpoch": 1}
        history = [{"epoch": 0, "trainLoss": 2, "validationLoss": 2, "validationAccuracy": 0.5},
                   {"epoch": 1, "trainLoss": 1, "validationLoss": 1.5, "validationAccuracy": 0.75}]
        candidate = {"history": history, "bestEpoch": 1, "updates": 2, "novelValidationPositions": 4}
        self.save(self.model.with_suffix(".json"), candidate)
        self.save(self.root / "pilot-v2" / "Fixture" / "full-history.json", candidate)
        self.save(self.root / "pilot-v2" / "development-results.json",
                  {"results": [{"player": "Fixture", "id": "full-history"}]})
        interval = {"mean": 0.1, "low": 0.05, "high": 0.15}
        metric = {"positions": 4, "moveMatch": 0.75, "crossEntropy": 1.5,
                  "paired": {"previous-personal": interval, "matched-repeated": interval}}
        methods = {name: copy.deepcopy(metric) for name in [
            "base", "context-base", "previous-personal", "matched-repeated", "selected", "selected-plus200", "wrong-person"]}
        (self.study / "predictions.csv").write_text("Fixture test predictions\n")
        (self.study / "frozen-selections.json").write_text("{}")
        self.report = {"predictionsSHA256": digest(self.study / "predictions.csv"),
            "selectionSHA256": digest(self.study / "frozen-selections.json"),
            "aggregate": {"strictNovel": methods},
            "players": [{"name": "Fixture", "elo": 1500, "counts": {"train": 10, "test": 5},
                         "selection": {"context": checkpoint}, "metrics": {"strictNovel": methods}}],
            "protocol": {"windows": {"trainEnd": 10, "validationEnd": 15, "testEnd": 20}}}
        self.save(self.study / "study-report.json", self.report)
        self.save(self.study / "browser-parity.json", [{"name": "Fixture", "tokenChannels": 96,
            "applicationWorker": True, "modelSHA256": checkpoint["sha256"],
            "errors": [{"policyMaximumAbsoluteError": 0.0001}],
            "heldOut": {"positions": 4, "matches": 3, "differences": []}}])
        self.save(self.root / "workflow" / "browser-report.json", {"tokenChannels": 96, "exportVerified": True, "bestEpoch": 1})
        self.save(self.root / "workflow" / "cuda-report.json", {"trainPositions": 10, "validationPositions": 4, "bestEpoch": 1})
        self.save(self.root / "workflow" / "workflow-parity.json", {"selectedCEDifference": 0.001, "heldOutAgreementDifference": 0})
        self.save(self.root / "parity" / "browser-parity.json", {"tokenChannels": 96,
            "baseline": {"policy": {"maximum": 0.0001}}, "gradients": [{"maximum": 0.00001} for _ in range(154)],
            "final": {"moveAgreement": 1}})

    def save(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def tearDown(self):
        self.temporary.cleanup()

    def test_checked_review_has_real_curves_model_links_and_caveats(self):
        contextual(self.study)
        output = (self.study / "index.html").read_text(encoding="utf-8")
        self.assertIn("earlier development data", output)
        self.assertIn("Previous personalized models", output)
        self.assertIn("75.00%", output)
        self.assertIn('href="../training/Fixture/full-history.onnx"', output)
        self.assertIn("<svg", output)
        self.assertIn("not a percentage of personality copied", output)

    def test_changed_predictions_and_models_cannot_be_published(self):
        path = self.study / "predictions.csv"
        original = path.read_bytes()
        path.write_bytes(b"Changed predictions")
        with self.assertRaisesRegex(ValueError, "test predictions changed"):
            contextual(self.study)
        path.write_bytes(original)
        self.model.write_bytes(b"Changed model")
        with self.assertRaisesRegex(ValueError, "downloadable selected model changed"):
            contextual(self.study)

    def test_missing_app_checks_or_incomplete_development_are_not_success(self):
        path = self.study / "browser-parity.json"
        original = path.read_bytes()
        self.save(path, [])
        with self.assertRaisesRegex(ValueError, "Every selected"):
            contextual(self.study)
        path.write_bytes(original)
        self.save(self.root / "released-pilot-v2" / "protocol.json", {"players": ["Fixture"], "rates": [1e-5]})
        with self.assertRaisesRegex(ValueError, "Finish the declared larger-model pilot"):
            contextual(self.study)


if __name__ == "__main__":
    unittest.main()
