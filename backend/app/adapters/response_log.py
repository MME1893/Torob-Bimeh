"""Persist provider JSON responses for contract discovery without credentials."""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger(__name__)
BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _write(provider: str, product: str, data: object) -> Path | None:
    try:
        root = Path(os.getenv("PROVIDER_RESPONSE_LOG_DIR", BACKEND_ROOT / "logs"))
        directory = root / provider
        directory.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
        safe_product = "".join(ch for ch in product if ch.isalnum() or ch in "_-") or "unknown"
        path = directory / f"{timestamp}_{safe_product}_{uuid4().hex[:8]}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        return path
    except (OSError, TypeError, ValueError) as exc:
        # Quote delivery must not fail just because diagnostic storage is full
        # or temporarily unavailable. Headers, tokens and request bodies are
        # deliberately never passed to this logger.
        logger.warning("Provider response log failed: provider=%s error=%s", provider, type(exc).__name__)
        return None


async def save_response(provider: str, product: str, data: object) -> Path | None:
    return await asyncio.to_thread(_write, provider, product, data)
