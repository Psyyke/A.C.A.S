"""Keep data-budget comparisons nested, whole-game and validation independent."""

import unittest

from game_budget_study import choose_games, fixed_novel_validation


class GameBudgetTests(unittest.TestCase):
    def test_samples_are_nested_whole_games_and_deterministic(self):
        samples = [{"gameId": f"game-{game}", "ply": ply} for game in range(10) for ply in [2, 4, 6]]
        first, first_games = choose_games(samples, "2", 42)
        larger, larger_games = choose_games(samples, "5", 42)
        self.assertEqual(len(first), 6)
        self.assertEqual(len(larger), 15)
        self.assertTrue(set(first_games).issubset(larger_games))
        self.assertEqual(choose_games(samples, "2", 42), (first, first_games))
        self.assertEqual(choose_games(samples, "all", 42)[0], samples)
        for bad in ["0", "11"]:
            with self.assertRaises(ValueError):
                choose_games(samples, bad, 42)

    def test_validation_novelty_is_relative_to_the_full_pool(self):
        board = "4k3/8/8/8/8/8/8/4K3 w - - 0 1"
        training = [{"gameId": "training", "fen": board}]
        validation = [{"gameId": "later", "fen": board},
                      {"gameId": "later", "fen": "4k3/8/8/8/8/8/P7/4K3 w - - 0 1"}]
        self.assertEqual(fixed_novel_validation(training, validation), validation[1:])
        with self.assertRaisesRegex(ValueError, "overlap"):
            fixed_novel_validation(training, [{"gameId": "training", "fen": board}])
        with self.assertRaisesRegex(ValueError, "No validation"):
            fixed_novel_validation(training, validation[:1])


if __name__ == "__main__":
    unittest.main()
