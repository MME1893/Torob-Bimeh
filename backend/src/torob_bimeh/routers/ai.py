"""AI HTTP endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from ..ai.chat_schema import ChatRequest, ChatResponse
from ..ai.chat_service import ChatService
from ..ai.client import AIConfigurationError, AIProviderError
from ..ai.comparison_schema import ComparisonAnalysisRequest, ComparisonAnalysisResponse
from ..ai.comparison_service import ComparisonAnalysisService
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


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(payload: ChatRequest) -> ChatResponse:
    try:
        return await ChatService().answer(payload)
    except AIConfigurationError:
        logger.exception("AI service is not configured")
        raise HTTPException(status_code=503, detail="AI chat is temporarily unavailable")
    except (AIProviderError, AIResponseValidationError):
        logger.exception("AI chat turn failed")
        raise HTTPException(status_code=502, detail="AI chat could not be completed")


@router.post("/comparison-analysis", response_model=ComparisonAnalysisResponse)
async def comparison_analysis(
    payload: ComparisonAnalysisRequest,
) -> ComparisonAnalysisResponse:
    """Optional AI layer under the deterministic comparison table.

    The table never depends on this endpoint: it only enriches the dialog.
    """
    try:
        return await ComparisonAnalysisService().analyze(payload)
    except AIConfigurationError:
        logger.exception("AI service is not configured")
        raise HTTPException(
            status_code=503, detail="AI comparison analysis is temporarily unavailable"
        )
    except (AIProviderError, AIResponseValidationError):
        logger.exception("AI comparison analysis failed")
        raise HTTPException(
            status_code=502, detail="AI comparison analysis could not be completed"
        )

