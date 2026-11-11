import unittest

from creative_holdout import prepare


def game(site="fresh", date="2026.10.25", title="", result="Normal"):
    return f'''[Event "Test"]
[Site "{site}"]
[UTCDate "{date}"]
[UTCTime "12:00:00"]
[White "Example"]
[Black "Other"]
[WhiteTitle "{title}"]
[Termination "{result}"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 *
'''.encode()


class FreshSourceTests(unittest.TestCase):
    def test_ownership_history_and_whole_game_identity(self):
        result = prepare("Player", "Example", [(72000001, game())], {"old"}, ["2026.10.24", "23:59:59"], 6000)
        self.assertEqual(len(result["games"]), 1)
        self.assertEqual([sample["ply"] for sample in result["samples"]], [0, 2, 4, 6])
        for sample in result["samples"]:
            self.assertEqual(sample["history"][0], sample["fen"])
            self.assertIn(sample["move"], sample["legalMoves"])
            self.assertEqual(sample["color"], "w")
            self.assertGreaterEqual(len(sample["legalMoves"]), 2)

    def test_overlap_bot_and_temporal_leakage_fail(self):
        for raw in [game(site="old"), game(title="BOT"), game(date="2026.10.01")]:
            with self.assertRaises(ValueError):
                prepare("Player", "Example", [(72000001, raw)], {"old"}, ["2026.10.24", "23:59:59"], 6000)

    def test_ineligible_games_are_reported_without_replacements(self):
        result = prepare("Player", "Example", [(72000001, game(result="Time forfeit"))], set(), ["2026.10.01", ""], 6000)
        self.assertEqual(result["samples"], [])
        self.assertIn("excluded", result)


if __name__ == "__main__":
    unittest.main()
