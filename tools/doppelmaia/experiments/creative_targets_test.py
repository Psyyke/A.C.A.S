import unittest

from creative_targets import target_recipe


class TargetRecipeTests(unittest.TestCase):
    def setUp(self):
        self.samples = [
            {"gameId": "a", "ply": 0, "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"},
            {"gameId": "b", "ply": 0, "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 2 5"},
            {"gameId": "b", "ply": 30, "fen": "8/8/4k3/8/8/4K3/8/8 w - - 0 16"},
        ]

    def test_baseline_and_phase_anchor(self):
        base = target_recipe(self.samples, [0, 1, 2], "baseline")
        self.assertEqual([row["anchor"] for row in base], [0.25] * 3)
        self.assertEqual([row["weight"] for row in base], [1] * 3)
        phase = target_recipe(self.samples, [0, 1, 2], "phase-anchor")
        self.assertEqual([row["anchor"] for row in phase], [0, 0, 0.75])

    def test_distribution_uses_only_same_board_training_choices(self):
        recipe = target_recipe(self.samples, [0, 1, 2], "choice-distribution")
        self.assertEqual(recipe[0]["distribution"], {0: 0.75, 1: 0.25})
        self.assertEqual(recipe[1]["distribution"], {0: 0.25, 1: 0.75})
        self.assertEqual(recipe[2]["distribution"], {2: 1})
        for row in recipe:
            self.assertAlmostEqual(sum(row["distribution"].values()), 1)

    def test_weights_are_normalized_without_changing_examples(self):
        for method in ["phase-balance", "game-balance", "game-balance-strong"]:
            recipe = target_recipe(self.samples, [0, 1, 2], method)
            self.assertAlmostEqual(sum(row["weight"] for row in recipe), 3)
        self.assertGreater(target_recipe(self.samples, [0, 1, 2], "game-balance")[0]["weight"], 1)
        self.assertGreater(target_recipe(self.samples, [0, 1, 2], "phase-balance")[2]["weight"], 1)
        strong = target_recipe(self.samples, [0, 1, 2], "game-balance-strong")
        self.assertAlmostEqual(strong[0]["weight"], strong[1]["weight"] + strong[2]["weight"])

    def test_invalid_inputs_fail(self):
        for samples, labels, method in [([], [], "baseline"), (self.samples, [0], "baseline"),
                                        (self.samples, [0, 1, 2], "unknown")]:
            with self.assertRaises(ValueError):
                target_recipe(samples, labels, method)


if __name__ == "__main__":
    unittest.main()
