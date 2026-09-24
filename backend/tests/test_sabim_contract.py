"""Sabim's third/body Query String is built in the HTML lab, not the backend."""

import unittest

from app.adapters.sabim.contract import InvalidSabimRequest, validate_query

THIRD = {
    "command": "get_price", "thirdparty_lastcompany": "1",
    "thirdparty_discnt_thirdparty_id": "1", "thirdparty_discnt_driver_id": "1",
    "thirdparty_last_date_sart": "2025-10-12", "thirdparty_last_date_end": "2026-10-06",
    "thirdparty_usefor_id": "1", "thirdparty_time_id": "1", "thirdparty_coverage_id": "31",
    "thirdparty_yadak": "false", "thirdparty_damage_driver_id": "1",
    "thirdparty_damage_human_id": "1", "thirdparty_damage_financial_id": "1",
    "carmode_id": "1", "car_company_id": "20", "car_id": "4001",
    "thirdparty_yearofcons_id": "0", "transition": "false", "prev_damage": "nadarad",
}
BODY = {
    "command": "get_price", "bodycar_discnt_id": "1",
    "bodycar_discnt_thirdparty_id": "1", "car_id": "4001",
    "bodycar_usefor_id": "1", "bodycar_last_company_id": "1",
    "bodycar_discnt_life_id": "22", "bodycar_discnt_another_id": "3",
    "bodycar_discnt_accbank_id": "10", "bodycar_price": "2000000000",
    "carmode_id": "1", "bodycar_time_id": "1", "bodycar_cash": "true",
    "car_company_id": "20", "bodycar_yearofcons_id": "0", "bodycar_prev": "nadarad",
    "bodycar_not_used": "false", "body_car_import": "false",
    "bodycar_coverage_id[]": [],
}


class SabimContractTests(unittest.TestCase):
    def test_car_and_motor_third_party_share_query_contract(self):
        self.assertEqual(dict(validate_query("third_car", THIRD)), THIRD)
        motor = {**THIRD, "carmode_id": "4"}
        self.assertEqual(dict(validate_query("third_motor", motor)), motor)

    def test_body_covers_repeat_the_same_query_key(self):
        body = {**BODY, "bodycar_coverage_id[]": ["1", "2"]}
        pairs = validate_query("body_car", body)
        self.assertEqual([v for k, v in pairs if k == "bodycar_coverage_id[]"], ["1", "2"])
        self.assertEqual(dict(validate_query("body_car", BODY))["bodycar_price"], "2000000000")

    def test_rejects_motor_body_wrong_mode_and_extra_keys(self):
        for product, query in (
            ("motor_body", BODY),
            ("body_car", {**BODY, "carmode_id": "4"}),
            ("third_car", {**THIRD, "carmode_id": "4"}),
            ("third_car", {**THIRD, "thirdparty_last_date_end": "2025-01-01"}),
            ("third_car", {**THIRD, "command": "other"}),
            ("third_car", {**THIRD, "new_field": "ignored"}),
            ("body_car", {**BODY, "bodycar_coverage_id[]": ["1", "1"]}),
        ):
            with self.subTest(product=product, query=query), self.assertRaises(InvalidSabimRequest):
                validate_query(product, query)


if __name__ == "__main__":
    unittest.main()
