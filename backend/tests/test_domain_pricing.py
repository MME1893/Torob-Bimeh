"""Verified provider amounts become comparable whole toman values."""

import unittest

from torob_bimeh.domain.pricing import to_toman


class PricingTest(unittest.TestCase):
    def test_verified_units_and_unknown_unit(self):
        self.assertEqual(to_toman(1_250_000, "toman"), 1_250_000)
        self.assertEqual(to_toman(12_500_000, "rial"), 1_250_000)
        self.assertIsNone(to_toman(12_500_000, "unknown"))

    def test_rial_rounding_and_invalid_values(self):
        self.assertEqual(to_toman(101, "rial"), 10)
        self.assertEqual(to_toman(105, "rial"), 11)
        self.assertEqual(to_toman(109, "rial"), 11)
        for amount, unit in ((-1, "toman"), (True, "rial"), (42, "USD")):
            with self.subTest(amount=amount, unit=unit), self.assertRaises(ValueError):
                to_toman(amount, unit)


if __name__ == "__main__":
    unittest.main()
