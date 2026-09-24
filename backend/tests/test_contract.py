"""Checks against the query shape captured in the supplied form laboratory."""

import os
import unittest
from unittest.mock import patch
from urllib.parse import urlencode

from app.adapters.azki_contract import (
    InvalidPriceRequest, make_headers, price_params_from_url,
    validate_price_params,
)


QUERY = {
    "vehicleTypeID": "6", "vehicleModelID": "806662", "vehicleBrandID": "84",
    "vehicleConstructionYear": "1404", "vehicleUsageID": "1",
    "withoutInsure": "false", "zeroKilometer": "true", "durationID": "12",
    "coverID": "47", "orig_cover_amount": "70000000", "isEdit": "false",
    "isExtend": "false", "sanhab": "false",
}
BASE = "https://www.azki.com/api/aggregator/v1/third/prices/compare"


class AzkiContractTests(unittest.TestCase):
    def test_accepts_captured_third_party_query_shape(self):
        self.assertEqual(price_params_from_url(BASE + "?" + urlencode(QUERY)), QUERY)
        self.assertEqual(validate_price_params(QUERY), QUERY)

    def test_rejects_different_hosts_paths_and_duplicate_parameters(self):
        for url in (
            "https://evil.example/api/aggregator/v1/third/prices/compare?" + urlencode(QUERY),
            "https://www.azki.com.evil.example/api/aggregator/v1/third/prices/compare?" + urlencode(QUERY),
            "https://www.azki.com/admin?" + urlencode(QUERY),
            BASE + "?" + urlencode(QUERY) + "&vehicleTypeID=9",
            "https://www.azki.com:bad" + BASE.removeprefix("https://www.azki.com") + "?" + urlencode(QUERY),
        ):
            with self.subTest(url=url[:90]), self.assertRaises(InvalidPriceRequest):
                price_params_from_url(url)

    def test_rejects_incomplete_query(self):
        with self.assertRaises(InvalidPriceRequest):
            validate_price_params({"vehicleTypeID": 1})

    def test_optional_authorization_stays_on_server(self):
        with patch.dict(os.environ, {"AZKI_AUTHORIZATION": "test-placeholder", "AZKI_DEVICE_ID": "6"}):
            headers = make_headers("third_motor")
        self.assertEqual(headers["Authorization"], "test-placeholder")
        self.assertEqual(headers["Referer"], "https://www.azki.com/motorcycle-insurance/compare")


if __name__ == "__main__":
    unittest.main()
