"""Extract the complete third-car option union from the four committed HTML labs.

Run from any directory. Each option keeps its source identity; identical titles
across providers are deliberately not merged into a supposed shared model.
"""

import json
import re
import hashlib
from collections import defaultdict, Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LABS = ROOT / "frontend" / "labs"
OUTPUT = ROOT / "backend" / "app" / "domain" / "third_catalog.json"


def embedded(file, element):
    html = (LABS / file).read_text(encoding="utf-8")
    match = re.search(r'<script id="' + element + r'"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        raise ValueError(f"{file}: {element} missing")
    return json.loads(match.group(1))


def build():
    azki = embedded("azki.html", "lab-data")["third"]
    sabim = embedded("sabim.html", "sabim-data")
    bazaar = embedded("bimebazar.html", "wizard-data")
    bimeh = embedded("bimeh.html", "catalog")
    steps = {step["identifier"]: step for step in bazaar}
    models = []
    seen = {}

    def add(provider, category, brand, model, mapping, usages):
        if not usages:
            return
        key = f"{provider}:{mapping['category']}:{mapping['brand']}:{mapping['model']}"
        if key in seen:
            old = seen[key]
            for usage in usages:
                if usage not in old["usages"]:
                    old["usages"].append(usage)
            return
        row = {"key": key, "label": f"{brand} {model}".strip(),
                       "category": category, "brand": brand, "model": model,
                       "provider": provider, "mapping": mapping,
                       "usages": usages}
        models.append(row)
        seen[key] = row

    for category in azki["vehicleHierarchy"]:
        for brand in category["brands"]:
            for model in brand["models"]:
                add("azki", category["title"], brand["title"], model["title"],
                    {"category": str(category["id"]), "brand": str(brand["id"]),
                     "model": str(model["id"]), "imported": model.get("imported", False)},
                    [{"key": str(u["id"]), "label": u["title"]} for u in category["usages"]])

    for mode in sabim["modes"]:
        if mode["id"] == "4":
            continue  # This product is third-party CAR, not motorcycle.
        uses = [{"key": u["id"], "label": u["name"]} for u in sabim["uses"] if u["mode"] == mode["id"]]
        makers = {(m["mode"], m["id"]): m["name"] for m in sabim["makers"]}
        for car in sabim["cars"]:
            if car["mode"] == mode["id"] and (car["mode"], car["maker"]) in makers:
                add("sabim", mode["name"], makers[(car["mode"], car["maker"])], car["name"],
                    {"category": car["mode"], "brand": car["maker"], "model": car["id"]}, uses)

    vehicle_type = steps["vehicle_type_picker"]["data"]
    for vehicle in vehicle_type:
        category_key = vehicle["value"]
        usage_step = steps.get(f"usage_picker_{category_key}")
        usages = (usage_step or {}).get("data", [])
        if not usages and category_key == "car":
            usages = [{"value": "passenger", "label": "شخصی"},
                      {"value": "agency", "label": "آژانس"},
                      {"value": "taxi_intracity", "label": "تاکسی درون شهری"},
                      {"value": "taxi_outskirt", "label": "تاکسی برون شهری"}]
        for usage in usages:
            usage_key = usage["value"]
            brand_step = steps.get(f"brand_picker_{category_key}_to_{usage_key}")
            if not brand_step:
                continue
            for brand in brand_step["data"]:
                model_step = steps.get(f"car_model_picker_{category_key}_{usage_key}_{brand['value']}")
                for model in (model_step or {"data": [{"value": "", "label": ""}]}).get("data", []):
                    add("bimebazar", vehicle["label"], brand["label"], model["label"],
                        {"category": category_key, "brand": brand["value"],
                         "model": model["value"]}, [{"key": usage_key, "label": usage["label"]}])

    for category in bimeh["categories"]:
        uses = [{"key": str(u["id"]), "label": u["title"]} for u in category["usages"]]
        for brand in category["brands"]:
            for model in bimeh["thirdpartyModels"].get(f"{brand['id']}:{category['id']}", []):
                add("bimeh", category["title"], brand["title"], model["Title"],
                    {"category": str(category["id"]), "brand": str(brand["id"]),
                     "model": str(model["Id"])}, uses)

    # A strict join is possible where four independent catalog dimensions
    # (category, maker, full model title, personal use) match exactly and each
    # provider has only one corresponding row. Similar words or aliases are
    # never enough. Keep the source rows alongside joined choices.
    def normalized(value):
        return re.sub(r"\s+", " ", value.strip().replace("ي", "ی").replace("ك", "ک"))

    groups = defaultdict(list)
    for row in models:
        if row["category"] == "سواری" and row["model"].strip() and any(
                normalized(u["label"]) == "شخصی" for u in row["usages"]):
            groups[(normalized(row["brand"]), normalized(row["model"]))].append(row)
    joined = []
    for (brand, model), rows in sorted(groups.items()):
        counts = Counter(r["provider"] for r in rows)
        if len(counts) < 2 or any(n != 1 for n in counts.values()):
            continue
        digest = hashlib.sha256((brand + "\0" + model).encode()).hexdigest()[:16]
        joined.append({"key": "shared:" + digest, "label": brand + " " + model,
                       "category_key": "shared:passenger", "brand_key": "shared:" + brand,
                       "usage_key": "personal", "evidence": "exact_unique_category_brand_model_usage",
                       "sources": [{"provider": r["provider"], "mapping": r["mapping"],
                                    "usage_key": next(u["key"] for u in r["usages"]
                                                      if normalized(u["label"]) == "شخصی")}
                                   for r in rows]})

    # The handwritten crosswalk provides reviewed, exact identities where
    # independent names differ (for example Peugeot Pars). Do not infer more.
    insurers = {}
    for provider, rows, id_field, name_field in (
        ("azki", azki["insurers"], "id", "title"),
        ("sabim", sabim["insurers"], "id", "name"),
        ("bimebazar", steps["previous_company_sb_off_picker"]["data"], "value", "label"),
        ("bimeh", bimeh["options"]["thirdparty"]["Companies"], "Id", "Title"),
    ):
        for row in rows:
            name = re.sub(r"^بیمه\s*", "", str(row[name_field]).strip()).strip()
            key = name.replace("ي", "ی").replace("ك", "ک")
            entry = insurers.setdefault(key, {"key": key, "label": name, "providers": {}})
            if provider in entry["providers"]:
                # An ambiguous duplicate must never silently overwrite an ID.
                del entry["providers"][provider]
            else:
                entry["providers"][provider] = str(row[id_field])
    coverages = {r["amount"] for r in azki["covers"] if r["enable"]}
    coverages.update(int(r["rial"]) // 10 for r in sabim["coverages"]
                     if int(r["rial"]) % 10 == 0 and "تومان" in r["name"])
    coverages.update(int(str(r["value"]["financial_coverage"])) for r in
                     steps["policy_term_and_financial_coverage"]["data"])
    for row in bimeh["options"]["thirdparty"]["CoverageTypes"]:
        digits = re.search(r"[\d۰-۹]+", row["Title"])
        if digits and "تومان" in row["Title"] and ("میلیون" in row["Title"] or "میلیارد" in row["Title"]):
            number = int(digits.group().translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")))
            coverages.add(number * (1_000_000_000 if "میلیارد" in row["Title"] else 1_000_000))
    years = {int(r["name"].split("-")[-1]) for r in sabim["years"]
             if re.fullmatch(r"\d{4}-1[34]\d{2}", r["name"])}
    years.update(int(row["value"]) for row in steps["car_production_year_picker"]["data"]
                 if isinstance(row["value"], int) and 1300 <= row["value"] <= 1500)
    for row in bimeh["options"]["thirdparty"]["ProductionYears"]:
        match = re.search(r"1[34]\d{2}", row["Title"])
        if match:
            years.add(int(match.group()))
    bimeh_options = {**bimeh["options"]["thirdparty"], "QuoteDurations": bimeh["fixtures"]["thirdparty"][0]["durations"]}
    result = {"models": models, "joined": joined,
              "insurers": sorted(insurers.values(), key=lambda item: item["label"]),
              "coverages_toman": sorted(coverages), "years_jalali": sorted(years, reverse=True), "options": {
        "azki": {k: azki[k] for k in ("fuelTypes", "insurers", "durations", "covers", "driverDiscounts", "thirdDiscounts", "driverLifeDamages", "thirdFinancialDamages", "thirdLifeDamages")},
        "sabim": {k: sabim[k] for k in ("insurers", "uses", "durations", "coverages", "years", "thirdDiscounts", "driverDiscounts", "financialDamages", "humanDamages", "driverDamages")},
        "bimebazar": {step: steps[step]["data"] for step in steps if step in (
            "policy_status_picker", "previous_company_sb_off_picker", "no_damage_factor_picker",
            "car_production_year_picker", "policy_term_and_financial_coverage", "ownership_change_status_picker",
            "driver_no_damage_factor_picker") or "damage_count" in step},
        "bimeh": bimeh_options,
    }}
    return result


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(build(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(build()['models'])} provider-scoped model/usage entries -> {OUTPUT}")
