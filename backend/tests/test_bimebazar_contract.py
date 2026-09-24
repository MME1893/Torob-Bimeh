"""Check the three Bimebazar offer URLs supplied with the project."""

import unittest
from urllib.parse import urlencode

from app.adapters.bimebazar.contract import (
    InvalidOfferRequest, OFFER_PATHS, offer_params_from_url,
    validate_offer_params,
)

CAR_THIRD = {
    "plk2": "1", "sb_id": "empty", "sanhab_submit_response_status": "regular",
    "has_plate_changed": "no_info_without_sb", "car_production_year": "1400",
    "vehicle_type": "car", "policy_term": "12", "policy_status": "other",
    "inquiry_type": "regular", "car_usage": "passenger",
    "car_brand": "car_peugeot", "car_model": "car_peugeot_peugeot-pars",
    "previous_company": "iran", "last_policy_start_date": "1404/7/1",
    "last_policy_exp_date": "1405/7/1", "has_ownership_change": "false",
    "no_damage_factor": "0", "driver_no_damage_factor": "0",
    "has_damage": "false", "financial_coverage": "20000000",
}
MOTOR_THIRD = {
    "car_brand": "one_cylinder", "car_production_year": "1398",
    "policy_status": "without", "policy_term": "12",
    "financial_coverage": "20000000",
}
CAR_BODY = {
    "plk2": "1", "sb_id": "empty", "sanhab_submit_response_status": "regular",
    "has_plate_changed": "no_info_without_sb", "car_production_year": "2024",
    "car_brand": "car_peugeot", "car_usage": "passenger",
    "discount_third_party": "1", "inquiry_type": "regular",
    "car_production_month": "2", "has_previous_policy": "false",
    "car_is_new": "false", "car_value": "900000000",
    "car_accessories_value": "0", "car_model": "car_peugeot_207-manual-panorama",
}


class BimebazarContractTests(unittest.TestCase):
    def test_three_sample_offer_urls(self):
        for product, params in (("third_car", CAR_THIRD), ("third_motor", MOTOR_THIRD),
                                ("body_car", CAR_BODY)):
            with self.subTest(product=product):
                url = "https://bimebazar.com" + OFFER_PATHS[product] + "?" + urlencode(params)
                self.assertEqual(offer_params_from_url(url, product), params)
                self.assertEqual(validate_offer_params(params, product), params)

    def test_optional_coupon_and_body_covers(self):
        params = {**CAR_BODY, "discount_code": "TEST", "cover_glass_break": "true"}
        self.assertEqual(validate_offer_params(params, "body_car"), params)

    def test_rejects_comparison_url_foreign_host_mismatched_product_and_duplicates(self):
        good = "https://bimebazar.com" + OFFER_PATHS["third_motor"] + "?" + urlencode(MOTOR_THIRD)
        for bad in (
            good.replace("/thirdpartymotor/api/offers/", "/compare/thirdpartymotor/"),
            good.replace("bimebazar.com/", "bimebazar.com.attacker.invalid/"),
            good.replace("https://", "http://"),
            good + "&car_brand=another",
        ):
            with self.subTest(bad=bad[:75]), self.assertRaises(InvalidOfferRequest):
                offer_params_from_url(bad, "third_motor")
        with self.assertRaises(InvalidOfferRequest):
            offer_params_from_url(good, "third_car")

    def test_rejects_incomplete_or_malformed_price(self):
        with self.assertRaises(InvalidOfferRequest):
            validate_offer_params({"car_brand": "one_cylinder"}, "third_motor")
        with self.assertRaises(InvalidOfferRequest):
            validate_offer_params({**CAR_BODY, "car_value": "not-a-number"}, "body_car")


if __name__ == "__main__":
    unittest.main()
