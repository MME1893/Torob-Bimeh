"""Routes for Azki laboratory calls; future providers get their own router."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, model_validator

from ..adapters.azki import AzkiUpstreamError, get_third_prices
from ..adapters.azki_contract import InvalidPriceRequest, price_params_from_url, validate_price_params


router = APIRouter(prefix="/api/azki", tags=["azki"])


class ThirdPriceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product: Literal["third_car", "third_motor"] = "third_car"
    url: str | None = None
    params: dict[str, str | int | bool] | None = None

    @model_validator(mode="after")
    def exactly_one_input(self):
        if (self.url is None) == (self.params is None):
            raise ValueError("دقیقاً یکی از url یا params را ارسال کنید")
        return self


@router.post("/prices/third")
async def third_price(request: ThirdPriceRequest):
    try:
        params = price_params_from_url(request.url) if request.url is not None else validate_price_params(request.params)
        return await get_third_prices(params, request.product)
    except InvalidPriceRequest as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AzkiUpstreamError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
