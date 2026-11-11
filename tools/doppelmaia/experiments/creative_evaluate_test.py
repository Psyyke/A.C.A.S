import contextlib
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

import chess

from creative_evaluate import board_keys, digest, freeze, load, slices
from unseen_data import save_json


class FrozenComparisonTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.args = SimpleNamespace(
            dataset=root / "dataset.json", previous=root / "previous.json",
            development=root / "development", fresh=root / "fresh.json", output=root / "evaluation",
        )
        self.args.development.mkdir()
        names = ["First", "Second"]
        save_json(self.args.dataset, {"players": [
            {"name": name, "splits": {"train": {"samples": [{}, {}, {}]}}} for name in names
        ]})
        identity = digest(self.args.dataset)
        previous = []
        for name in names:
            path = root / f"{name}-previous.onnx"
            path.write_bytes(name.encode())
            previous.append({"name": name, "elo": 1500, "context": {
                "path": str(path), "sha256": digest(path), "validationCE": 1.2,
            }})
        save_json(self.args.previous, {
            "datasetSHA256": identity, "previousDatasetPath": str(self.args.dataset),
            "previousDatasetSHA256": identity, "players": previous,
        })
        protocol_path = self.args.development / "protocol.json"
        save_json(protocol_path, {
            "datasetSHA256": identity, "players": names, "positionLimit": 3,
            "methods": ["baseline", "game-balance"],
        })
        for name in names:
            directory = self.args.development / name
            directory.mkdir()
            for method in ["baseline", "game-balance"]:
                path = directory / f"{method}.onnx"
                path.write_bytes(f"{name}-{method}".encode())
                loss = 1.199999 if name == "First" else 1.1
                save_json(path.with_suffix(".json"), {
                    "protocolSHA256": digest(protocol_path), "exportSHA256": digest(path),
                    "validation": {"loss": loss},
                })
        directory = self.args.development / "Second"
        average = directory / "checkpoint-mean-3.onnx"
        average.write_bytes(b"averaged checkpoint fixture")
        save_json(directory / "averages.json", {
            "protocolSHA256": digest(protocol_path),
            "results": [
                {"id": "checkpoint-mean-3", "loss": 1.05, "exportSHA256": digest(average)},
                {"id": "base-shrink", "loss": 1.0},
            ],
        })
        save_json(self.args.fresh, {"protocol": {
            "previousDatasetSHA256": identity, "accounts": names,
        }})

    def test_selection_retains_previous_and_uses_only_verified_exports(self):
        with contextlib.redirect_stdout(io.StringIO()):
            freeze(self.args)
        result = load(self.args.output / "frozen-selections.json")
        self.assertEqual([row["selected"]["id"] for row in result["players"]],
                         ["previous", "checkpoint-mean-3"])
        self.assertNotIn("base-shrink", [row["id"] for row in result["players"][1]["candidates"]])
        self.assertEqual(result["freshSHA256"], digest(self.args.fresh))
        self.assertTrue((self.args.output / "source.zip").is_file())

    def test_incomplete_training_or_cohort_is_rejected(self):
        path = self.args.development / "protocol.json"
        original = load(path)
        for changes in [{"positionLimit": 2}, {"players": ["First"]}]:
            save_json(path, {**original, **changes})
            with self.assertRaises(ValueError):
                freeze(self.args)

    def test_changed_export_is_rejected(self):
        path = self.args.development / "First" / "baseline.onnx"
        path.write_bytes(b"changed after training")
        with self.assertRaisesRegex(ValueError, "frozen development protocol"):
            freeze(self.args)

    def test_frozen_selection_cannot_be_replaced(self):
        with contextlib.redirect_stdout(io.StringIO()):
            freeze(self.args)
        path = self.args.development / "First" / "baseline.json"
        report = load(path)
        report["validation"]["loss"] = 1.0
        save_json(path, report)
        with self.assertRaisesRegex(ValueError, "new evaluation directory"):
            freeze(self.args)

    def test_phase_slices_and_conservative_board_novelty(self):
        full = {"fen": chess.STARTING_FEN, "ply": 24}
        sparse = {"fen": "8/8/4k3/8/8/4K3/8/8 w - - 0 16", "ply": 24}
        self.assertEqual(slices({**sparse, "ply": 0}, True, False), ["all", "familiar-opening"])
        self.assertEqual(slices({**full, "ply": 23}, False, True), ["all", "strict-new", "new-opening"])
        self.assertEqual(slices(full, False, True), ["all", "strict-new", "new-middle"])
        self.assertEqual(slices(sparse, False, True), ["all", "strict-new", "new-sparse"])
        self.assertEqual(slices(full, False, False), ["all"])
        changed_metadata = {**full, "fen": chess.STARTING_FEN.replace("KQkq", "-").replace("0 1", "3 12")}
        self.assertEqual(len(board_keys([full, changed_metadata])), 1)


if __name__ == "__main__":
    unittest.main()
