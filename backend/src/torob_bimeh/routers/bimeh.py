"""Bimeh.com quote endpoint for the three supported lab tabs."""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from ..adapters.bimeh.client import BimehConfigurationError, BimehUpstreamError, get_prices
from ..adapters.bimeh.contract import InvalidBimehRequest, validate_inquiry

router = APIRouter(prefix="/api/bimeh", tags=["bimeh"])


class InquiryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product: Literal["third_car", "body_car", "third_motor"]
    body: dict[str, Any]


@router.post("/prices")
async def prices(request: InquiryRequest):
    try:
        body = validate_inquiry(request.product, request.body)
        return await get_prices(request.product, body)
    except InvalidBimehRequest as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except BimehConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except BimehUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
