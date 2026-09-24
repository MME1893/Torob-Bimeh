"""Price offers from Bimebazar; comparison page URLs stay in the frontend."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, model_validator

from ..adapters.bimebazar.client import BimebazarUpstreamError, get_offers
from ..adapters.bimebazar.contract import InvalidOfferRequest, offer_params_from_url, validate_offer_params

router = APIRouter(prefix="/api/bimebazar", tags=["bimebazar"])


class OffersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product: Literal["third_car", "third_motor", "body_car"]
    url: str | None = None
    params: dict[str, str | int | bool] | None = None

    @model_validator(mode="after")
    def exactly_one_input(self):
        if (self.url is None) == (self.params is None):
            raise ValueError("دقیقاً یکی از url یا params را ارسال کنید")
        return self


@router.post("/offers")
async def offers(request: OffersRequest):
    try:
        params = (offer_params_from_url(request.url, request.product) if request.url is not None
                  else validate_offer_params(request.params, request.product))
        return await get_offers(request.product, params)
    except InvalidOfferRequest as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except BimebazarUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
