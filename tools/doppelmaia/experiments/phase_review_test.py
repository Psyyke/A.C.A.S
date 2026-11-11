"""Check phase boundaries and complete, paired prediction accounting."""

import copy
import unittest

from phase_review import analyze, phase, repeated_choices


class PhaseReviewTests(unittest.TestCase):
    def setUp(self):
        self.samples = [
            {"fen": "8/8/8/8/8/4k3/8/4K3 w - - 0 1", "move": "e1f1",
             "ply": 23, "gameId": "one", "legalMoves": ["e1f1", "e1d1"]},
            {"fen": "8/8/8/8/8/4k3/8/4K3 w - - 0 13", "move": "e1d1",
             "ply": 24, "gameId": "two", "legalMoves": ["e1f1", "e1d1"]},
        ]
        self.data = {"players": [{"name": "Fixture", "splits": {
            "train": {"samples": self.samples}, "test": {"samples": self.samples}}}]}
        self.rows = [{"player": "Fixture", "method": "selected", "sample": str(index),
                      "ply": str(sample["ply"]), "strictNovel": "True", "familiar": "False",
                      "match": str(1 - index), "crossEntropy": "1.5", "gameId": sample["gameId"]}
                     for index, sample in enumerate(self.samples)]

    def test_phases_are_disjoint_at_the_opening_boundary(self):
        self.assertEqual(phase(self.samples[0]), "opening")
        self.assertEqual(phase(self.samples[1]), "sparse")
        sample = {**self.samples[1], "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 13"}
        self.assertEqual(phase(sample), "middle")
        sample["fen"] = "4k3/pppppppp/8/8/8/8/8/4K3 w - - 0 13"
        self.assertEqual(phase(sample), "sparse")
        sample["fen"] = "4k3/pppppppp/8/8/8/8/P7/4K3 w - - 0 13"
        self.assertEqual(phase(sample), "middle")

    def test_aggregate_retains_every_position_and_source_game(self):
        result = analyze(self.data, self.rows)
        overall = result["metrics"]["strictNovel"]["overall"]["selected"]
        self.assertEqual((overall["positions"], overall["sourceGames"], overall["moveAgreement"]), (2, 2, 0.5))
        self.assertEqual(result["coverage"][0]["splits"]["train"]["gamesRepresented"], 2)

    def test_duplicate_missing_and_wrong_ply_predictions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            analyze(self.data, self.rows + [self.rows[0]])
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            analyze(self.data, self.rows[:1])
        rows = copy.deepcopy(self.rows)
        rows[0]["ply"] = "0"
        with self.assertRaisesRegex(ValueError, "ply"):
            analyze(self.data, rows)

    def test_move_counters_do_not_hide_observed_choice_variation(self):
        result = repeated_choices(self.samples)
        self.assertEqual(result["repeatedBoards"], 1)
        self.assertEqual(result["boardsWithDifferentRecordedMoves"], 1)
        self.assertEqual(result["observations"], 2)


if __name__ == "__main__":
    unittest.main()
