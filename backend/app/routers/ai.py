"""AI HTTP endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from ..ai.client import AIConfigurationError, AIProviderError
from ..ai.quote_schema import QuoteAnalysisRequest, QuoteAnalysisResponse
from ..ai.quote_service import AIResponseValidationError, QuoteAnalysisService


router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)


@router.post("/quote-analysis", response_model=QuoteAnalysisResponse)
async def quote_analysis(payload: QuoteAnalysisRequest) -> QuoteAnalysisResponse:
    try:
        return await QuoteAnalysisService().analyze(payload)
    except AIConfigurationError:
        logger.exception("AI service is not configured")
        raise HTTPException(status_code=503, detail="AI analysis is temporarily unavailable")
    except (AIProviderError, AIResponseValidationError):
        logger.exception("Quote AI analysis failed")
        raise HTTPException(status_code=502, detail="AI analysis could not be completed")

