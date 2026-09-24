"""Sabim lab endpoint: three confirmed products, no motor-body upstream call."""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from ..adapters.sabim import SabimUpstreamError, get_prices
from ..adapters.sabim_contract import InvalidSabimRequest, validate_query

router = APIRouter(prefix="/api/sabim", tags=["sabim"])


class PriceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product: Literal["third_car", "third_motor", "body_car"]
    query: dict[str, Any]


@router.post("/prices")
async def prices(request: PriceRequest):
    try:
        validate_query(request.product, request.query)
        return await get_prices(request.product, request.query)
    except InvalidSabimRequest as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SabimUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
