"""Provider-scoped union generated from the four supplied HTML catalogs.

The entries are deliberately explicit. Similar names must not create IDs by
fuzzy matching; expand only after checking each provider's actual catalog.
"""

import hashlib
import re
from collections import defaultdict
from functools import lru_cache

CAR_MODELS = {
    "peugeot_pars": {
        "label": "پژو پارس",
        "category_key": "passenger",
        "brand_key": "peugeot",
        "usage_key": "personal",
        "azki": {"vehicleTypeID": "1", "vehicleBrandID": "18", "vehicleModelID": "182341", "vehicleUsageID": "1"},
        "sabim": {"carmode_id": "1", "car_company_id": "22", "car_id": "13", "thirdparty_usefor_id": "1"},
        "bimebazar": {"vehicle_type": "car", "car_brand": "car_peugeot",
                       "car_model": "car_peugeot_peugeot-pars", "car_usage": "passenger"},
        "bimeh": {"UsingTypeId": 1, "VehicleCategoryId": 1, "BrandId": 1001, "ModelId": 1023},
    },
    "peugeot_206_type2": {
        "label": "پژو ۲۰۶ تیپ ۲",
        "category_key": "passenger",
        "brand_key": "peugeot",
        "usage_key": "personal",
        "azki": {"vehicleTypeID": "1", "vehicleBrandID": "18", "vehicleModelID": "182091", "vehicleUsageID": "1"},
        "sabim": {"carmode_id": "1", "car_company_id": "22", "car_id": "31", "thirdparty_usefor_id": "1"},
        "bimebazar": {"vehicle_type": "car", "car_brand": "car_peugeot",
                       "car_model": "car_peugeot_206-type2", "car_usage": "passenger"},
        "bimeh": {"UsingTypeId": 1, "VehicleCategoryId": 1, "BrandId": 1001, "ModelId": 1030},
    },
    "peugeot_206_type5": {
        "label": "پژو ۲۰۶ تیپ ۵",
        "category_key": "passenger",
        "brand_key": "peugeot",
        "usage_key": "personal",
        "azki": {"vehicleTypeID": "1", "vehicleBrandID": "18", "vehicleModelID": "182121", "vehicleUsageID": "1"},
        "sabim": {"carmode_id": "1", "car_company_id": "22", "car_id": "111", "thirdparty_usefor_id": "1"},
        "bimebazar": {"vehicle_type": "car", "car_brand": "car_peugeot",
                       "car_model": "car_peugeot_206-type5", "car_usage": "passenger"},
        "bimeh": {"UsingTypeId": 1, "VehicleCategoryId": 1, "BrandId": 1001, "ModelId": 1033},
    }
}


@lru_cache(maxsize=1)
def catalog():
    # Build once from the authoritative labs; never trust a stale generated file.
    from scripts.build_third_catalog import build
    return build()


def _provider_mapping(provider, mapping, usage_key):
    if provider == "azki":
        return {"vehicleTypeID": mapping["category"], "vehicleBrandID": mapping["brand"],
                "vehicleModelID": mapping["model"], "vehicleUsageID": usage_key,
                "imported": mapping.get("imported", False)}
    if provider == "sabim":
        return {"carmode_id": mapping["category"], "car_company_id": mapping["brand"],
                "car_id": mapping["model"], "thirdparty_usefor_id": usage_key}
    if provider == "bimebazar":
        result = {"vehicle_type": mapping["category"], "car_brand": mapping["brand"],
                  "car_usage": usage_key}
        if mapping["model"]:
            result["car_model"] = mapping["model"]
        return result
    return {"VehicleCategoryId": int(mapping["category"]), "BrandId": int(mapping["brand"]),
            "ModelId": int(mapping["model"]), "UsingTypeId": int(usage_key)}


_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_USAGES = {
    "شخصی": "personal", "آژانس": "agency", "تاکسی درون شهری": "taxi_intracity",
    "تاکسی برون شهری": "taxi_outskirt",
}


def _normalized(value):
    value = str(value).translate(_DIGITS).replace("ي", "ی").replace("ك", "ک").replace("‌", " ").lower()
    value = re.sub(r"(?<=\D)(\d)", r" \1", value)
    value = re.sub(r"(\d)(?=\D)", r"\1 ", value)
    value = re.sub(r"[^\w\u0600-\u06ff]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _model_identity(brand, model):
    brand_key, model_key = _normalized(brand), _normalized(model)
    while model_key == brand_key or model_key.startswith(brand_key + " "):
        model_key = model_key[len(brand_key):].strip()
    # Seating suffixes in one catalog do not describe a different trim.
    model_key = re.sub(r"\s+\d+\s*س$", "", model_key).strip()
    return model_key


def _usage_identity(label):
    label = _normalized(label)
    known = next((key for title, key in _USAGES.items() if _normalized(title) == label), None)
    return known or "usage:" + hashlib.sha256(label.encode()).hexdigest()[:12]


def _public_keys(category, brand):
    category_key = "category:" + _normalized(category)
    digest = hashlib.sha256((_normalized(category) + "\0" + _normalized(brand)).encode()).hexdigest()[:12]
    return category_key, "brand:" + digest


@lru_cache(maxsize=1)
def public_models():
    """One product-facing vehicle list with provider mappings kept server-side."""
    groups = defaultdict(list)
    for row in catalog()["models"]:
        signature = (_normalized(row["category"]), _normalized(row["brand"]),
                     _model_identity(row["brand"], row["model"]))
        if all(signature):
            groups[signature].append(row)

    reviewed_signatures = set()
    output = []
    for key, row in CAR_MODELS.items():
        label = row["label"]
        brand = "پژو"
        model = label.removeprefix(brand).strip()
        category = "سواری"
        category_key, brand_key = _public_keys(category, brand)
        sources = {}
        for provider in ("azki", "sabim", "bimebazar", "bimeh"):
            if provider not in row:
                continue
            mapping = dict(row[provider])
            usage_field = {"azki": "vehicleUsageID", "sabim": "thirdparty_usefor_id",
                           "bimebazar": "car_usage", "bimeh": "UsingTypeId"}[provider]
            sources[provider] = {"mapping": mapping, "usages": {"personal": str(mapping[usage_field])},
                                 "direct": True}
        reviewed_signatures.add((_normalized(category), _normalized(brand), _model_identity(brand, model)))
        output.append({"key": key, "label": label, "category": category,
                       "category_key": category_key, "brand": brand, "brand_key": brand_key,
                       "model": model, "providers": [p for p in ("azki", "sabim", "bimebazar", "bimeh") if p in sources],
                       "source_count": len(sources), "imported": row.get("azki", {}).get("imported", False),
                       "usages": [{"key": "personal", "label": "شخصی"}], "sources": sources})

    for signature, rows in sorted(groups.items()):
        if signature in reviewed_signatures:
            continue
        by_provider = defaultdict(list)
        for row in rows:
            by_provider[row["provider"]].append(row)
        # Ambiguous IDs from one source are not guessed. Other exact mappings remain usable.
        selected = {provider: items[0] for provider, items in by_provider.items() if len(items) == 1}
        if not selected:
            continue
        preferred = next((selected[p] for p in ("bimebazar", "bimeh", "azki", "sabim") if p in selected))
        category, brand = preferred["category"], preferred["brand"]
        model = re.sub(r"\s+", " ", preferred["model"]).strip()
        while model == brand or model.startswith(brand + " "):
            model = model[len(brand):].strip()
        category_key, brand_key = _public_keys(category, brand)
        sources, usage_labels = {}, {}
        for provider, source in selected.items():
            usages = {}
            for usage in source["usages"]:
                usage_key = _usage_identity(usage["label"])
                usages[usage_key] = str(usage["key"])
                usage_labels.setdefault(usage_key, usage["label"])
            sources[provider] = {"mapping": source["mapping"], "usages": usages}
        digest = hashlib.sha256("\0".join(signature).encode()).hexdigest()[:16]
        output.append({"key": "vehicle:" + digest, "label": f"{brand} {model}".strip(),
                       "category": category, "category_key": category_key, "brand": brand,
                       "brand_key": brand_key, "model": model,
                       "providers": [p for p in ("azki", "sabim", "bimebazar", "bimeh") if p in sources],
                       "source_count": len(sources),
                       "imported": selected.get("azki", {}).get("mapping", {}).get("imported"),
                       "usages": [{"key": key, "label": label} for key, label in usage_labels.items()],
                       "sources": sources})
    return output


@lru_cache(maxsize=1)
def public_body_models():
    """Body-car union, joined only by exact normalized source identity."""
    groups = defaultdict(list)
    for row in catalog()["body_models"]:
        signature = (_normalized(row["category"]), _normalized(row["brand"]),
                     _model_identity(row["brand"], row["model"]))
        if all(signature):
            groups[signature].append(row)
    output = []
    for signature, rows in sorted(groups.items()):
        by_provider = defaultdict(list)
        for row in rows:
            by_provider[row["provider"]].append(row)
        selected = {provider: values[0] for provider, values in by_provider.items()
                    if len(values) == 1}
        if not selected:
            continue
        preferred = next(selected[p] for p in ("bimebazar", "bimeh", "azki", "sabim")
                         if p in selected)
        category, brand = preferred["category"], preferred["brand"]
        model = re.sub(r"\s+", " ", preferred["model"]).strip()
        while model == brand or model.startswith(brand + " "):
            model = model[len(brand):].strip()
        category_key, brand_key = _public_keys(category, brand)
        sources, usage_labels = {}, {}
        for provider, source in selected.items():
            usages = {}
            for usage in source["usages"]:
                usage_key = _usage_identity(usage["label"])
                usages[usage_key] = str(usage["key"])
                usage_labels.setdefault(usage_key, usage["label"])
            sources[provider] = {"mapping": source["mapping"], "usages": usages,
                                 "model_key": source["key"]}
        digest = hashlib.sha256("\0".join(signature).encode()).hexdigest()[:16]
        output.append({"key": "body:" + digest, "label": f"{brand} {model}".strip(),
                       "category": category, "category_key": category_key,
                       "brand": brand, "brand_key": brand_key, "model": model,
                       "providers": [p for p in ("azki", "sabim", "bimebazar", "bimeh") if p in sources],
                       "source_count": len(sources),
                       "imported": selected.get("azki", {}).get("mapping", {}).get("imported"),
                       "usages": [{"key": key, "label": label}
                                  for key, label in usage_labels.items()], "sources": sources})
    return output


def match_body_car(vehicle, provider_selections=None):
    public = next((item for item in public_body_models() if item["key"] == vehicle.model_key), None)
    mapped = {}
    if public and (vehicle.category_key, vehicle.brand_key) == (
            public["category_key"], public["brand_key"]):
        for provider, source in public["sources"].items():
            usage = source["usages"].get(vehicle.usage_key)
            if usage is not None:
                mapped[provider] = _provider_mapping(provider, source["mapping"], usage)
    for provider, selection in (provider_selections or {}).items():
        mapped.pop(provider, None)
        source = next((row for row in catalog()["body_models"]
                       if row["provider"] == provider and row["key"] == selection.model_key), None)
        if source and any(str(row["key"]) == str(selection.usage_key) for row in source["usages"]):
            mapped[provider] = _provider_mapping(provider, source["mapping"], selection.usage_key)
    return mapped or None


def match_car(vehicle):
    row = CAR_MODELS.get(vehicle.model_key)
    if row and all(getattr(vehicle, key) == row[key] for key in
                   ("category_key", "brand_key", "usage_key")):
        return row
    public = next((item for item in public_models() if item["key"] == vehicle.model_key), None)
    if public and (vehicle.category_key, vehicle.brand_key) == (public["category_key"], public["brand_key"]):
        mapped = {}
        for provider, source in public["sources"].items():
            usage = source["usages"].get(vehicle.usage_key)
            if usage is not None:
                if source.get("direct"):
                    mapped[provider] = dict(source["mapping"])
                else:
                    mapped[provider] = _provider_mapping(provider, source["mapping"], usage)
        return mapped or None
    group = next((g for g in catalog()["joined"] if g["key"] == vehicle.model_key), None)
    if group:
        if (vehicle.category_key, vehicle.brand_key, vehicle.usage_key) != (
                group["category_key"], group["brand_key"], group["usage_key"]):
            return None
        return {source["provider"]: _provider_mapping(source["provider"], source["mapping"],
                                                       source["usage_key"])
                for source in group["sources"]}
    # The full union retains provider scope. A source ID is used only for its
    # originating provider; independent catalogs never share an inferred ID.
    item = next((m for m in catalog()["models"] if m["key"] == vehicle.model_key), None)
    if not item or (vehicle.category_key != f'{item["provider"]}:{item["mapping"]["category"]}'
                    or vehicle.brand_key != f'{item["provider"]}:{item["mapping"]["brand"]}'
                    or vehicle.usage_key not in {u["key"] for u in item["usages"]}):
        return None
    return {item["provider"]: _provider_mapping(item["provider"], item["mapping"], vehicle.usage_key)}


def match_motor(vehicle):
    """Return only the provider IDs explicitly recorded for a motor type."""
    item = next((row for row in catalog()["motor_types"]
                 if row["key"] == vehicle.motor_type_key), None)
    return {provider: dict(mapping) for provider, mapping in item["mapping"].items()} if item else None
