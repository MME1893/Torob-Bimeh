"""Contract checks from the three successful Bimeh.com inquiry variants."""

import unittest

from torob_bimeh.adapters.bimeh.contract import InvalidBimehRequest, PATHS, validate_inquiry


THIRD = {
    "UsingTypeId": 1, "VehicleCategoryId": 1, "BrandId": 1001, "ModelId": 1001,
    "ProductionYearId": 2025, "PreviousInsuranceStatusId": 0,
    "ReleaseDate": "2026/9/22", "DurationId": 2, "isRenewal": False,
    "InquiryUrl": "https://bimeh.com/thirdparty/planlist?UsingTypeId=1",
}
MOTOR = {
    "MotorTypeId": 11, "ProductionYearId": 2024, "PreviousInsuranceStatusId": 1,
    "DurationId": 2, "isRenewal": False,
    "InquiryUrl": "https://bimeh.com/thirdpartyMotor/planlist?MotorTypeId=11",
}
BODY = {
    "UsingTypeId": 1, "VehicleCategoryId": 1, "BrandId": 1001, "ModelId": 1001,
    "hasInsurance": False, "CarBodyNoDamageYearId": None, "Imported": 0,
    "Price": 1999999990, "ProductionDate": "2026/4/01", "yearBuild": 2026,
    "monthBuild": 4, "pYear": 1405, "pMonth": 2,
    "PreviousExpirationDate": "2026-09-23", "PreviousCompanyId": None,
    "ThirdPartyDiscountId": 1, "ThirdPartyCompanyId": 1034,
    "isRenewal": False,
    "InquiryUrl": "https://bimeh.com/carbody/planlist?BrandId=1001",
}


class BimehContractTest(unittest.TestCase):
    def test_three_successful_endpoint_paths_and_payloads(self):
        self.assertEqual(len(PATHS), 3)
        for product, body in (("third_car", THIRD), ("third_motor", MOTOR), ("body_car", BODY)):
            with self.subTest(product=product):
                self.assertEqual(validate_inquiry(product, body), body)

    def test_body_coverages_and_motor_statuses(self):
        self.assertEqual(validate_inquiry("body_car", {**BODY, "CoverageIds": [3, 16],
                                                      "fromFilter": True})["CoverageIds"], [3, 16])
        self.assertEqual(validate_inquiry("third_motor", {**MOTOR, "MotorTypeId": 12})["MotorTypeId"], 12)

    def test_reject_cross_product_link_unexpected_fields_and_types(self):
        for product, body in (("third_car", {**THIRD, "InquiryUrl": BODY["InquiryUrl"]}),
                              ("body_car", {**BODY, "Price": "1999999990"}),
                              ("third_motor", {**MOTOR, "MotorTypeId": True}),
                              ("third_car", {**THIRD, "extra": "value"}),
                              ("body_car", {**BODY, "InquiryUrl": "https://evil.example/planlist?a=1"})):
            with self.subTest(product=product, body=body), self.assertRaises(InvalidBimehRequest):
                validate_inquiry(product, body)


if __name__ == "__main__":
    unittest.main()
