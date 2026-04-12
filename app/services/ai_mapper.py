"""
AI Webhook Mapper — Enhanced with retry logic and error categorization.

Retry strategy
--------------
* Transient errors (rate-limit, server error, timeout, network):
  Retried up to ``settings.AI_MAX_RETRIES`` times with exponential back-off
  (2 s → 4 s → 8 s … capped at 30 s).
* Permanent errors (bad JSON, schema validation failure):
  Logged and immediately fall back — retrying would produce the same result.
* No API key:
  Immediately fall back.
"""

import json
import logging
from enum import Enum

import httpx
from pydantic import ValidationError
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.schemas.event_schema import StandardEvent

logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-20250514"

SYSTEM_PROMPT = """\
You are a webhook normalization engine.
Convert any webhook JSON into a standardized schema.

Rules:
- event_type must be short and uppercase (e.g., PAYMENT_SUCCESS, REPO_STAR, ORDER_PLACED)
- actor should be the user identifier (email, username, id, or "unknown" if not present)
- payload should contain only useful, structured data — omit raw/redundant fields
- do NOT include unnecessary nested fields
- infer meaning from context if fields are unclear
- confidence: 0.8–1.0 for clear known formats, 0.5–0.8 for partial inference, <0.5 for unclear

Return ONLY valid JSON with no markdown, no explanation:
{
  "event_type": "...",
  "actor": "...",
  "payload": {...},
  "confidence": 0.0
}"""


# ---------------------------------------------------------------------------
# Error taxonomy
# ---------------------------------------------------------------------------

class AIErrorCategory(str, Enum):
    RATE_LIMIT = "rate_limit"
    SERVER_ERROR = "server_error"
    PARSE_ERROR = "parse_error"
    VALIDATION_ERROR = "validation_error"
    TIMEOUT = "timeout"
    NETWORK = "network"
    UNKNOWN = "unknown"


class RetryableAIError(Exception):
    """Transient error — safe to retry (rate-limit, 5xx, timeout, network)."""

    def __init__(self, category: AIErrorCategory, message: str) -> None:
        self.category = category
        super().__init__(message)


class PermanentAIError(Exception):
    """Non-retryable error — retrying would not help (bad JSON, schema mismatch)."""

    def __init__(self, category: AIErrorCategory, message: str) -> None:
        self.category = category
        super().__init__(message)


# ---------------------------------------------------------------------------
# Single API attempt
# ---------------------------------------------------------------------------

async def _call_claude_once(api_key: str, raw_json: dict) -> StandardEvent:
    """
    Make one HTTP call to the Claude API and return a validated ``StandardEvent``.

    Raises
    ------
    RetryableAIError   — for transient errors worth retrying.
    PermanentAIError   — for deterministic failures (won't improve on retry).
    """
    user_message = f"Here is the webhook JSON:\n{json.dumps(raw_json, indent=2)}"

    request_body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    }

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            response = await client.post(ANTHROPIC_API_URL, json=request_body, headers=headers)

        status = response.status_code

        if status == 429:
            raise RetryableAIError(
                AIErrorCategory.RATE_LIMIT,
                f"Claude API rate-limited (429): {response.text[:200]}",
            )
        if status >= 500:
            raise RetryableAIError(
                AIErrorCategory.SERVER_ERROR,
                f"Claude API server error ({status}): {response.text[:200]}",
            )
        if status >= 400:
            raise PermanentAIError(
                AIErrorCategory.UNKNOWN,
                f"Claude API client error ({status}): {response.text[:200]}",
            )

        raw_text = _extract_text(response.json())
        logger.debug("AI raw response: %.300s", raw_text)

    except httpx.TimeoutException as exc:
        raise RetryableAIError(AIErrorCategory.TIMEOUT, f"Request timed out: {exc}") from exc
    except httpx.RequestError as exc:
        raise RetryableAIError(AIErrorCategory.NETWORK, f"Network error: {exc}") from exc

    # --- Parse JSON ---
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise PermanentAIError(
            AIErrorCategory.PARSE_ERROR,
            f"AI response is not valid JSON: {exc}",
        ) from exc

    # --- Validate schema ---
    try:
        event = StandardEvent(**parsed)
    except (ValidationError, TypeError) as exc:
        raise PermanentAIError(
            AIErrorCategory.VALIDATION_ERROR,
            f"AI response failed schema validation: {exc}",
        ) from exc

    logger.info(
        "AI mapping succeeded — event_type=%s confidence=%.2f",
        event.event_type,
        event.confidence,
    )
    return event


# ---------------------------------------------------------------------------
# Public entry-point with retry wrapping
# ---------------------------------------------------------------------------

async def map_webhook_to_standard(raw_json: dict) -> StandardEvent:
    """
    Normalize a raw webhook payload to ``StandardEvent`` via Claude AI.

    * Retries transient errors with exponential back-off (tenacity).
    * Falls back to a safe ``UNKNOWN`` event on permanent or exhausted failures.
    """
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set — using fallback mapping.")
        return _build_fallback(raw_json)

    result: StandardEvent | None = None

    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(settings.AI_MAX_RETRIES),
            wait=wait_exponential(multiplier=1, min=2, max=30),
            retry=retry_if_exception_type(RetryableAIError),
            reraise=True,
        ):
            with attempt:
                attempt_num = attempt.retry_state.attempt_number
                if attempt_num > 1:
                    logger.info(
                        "AI mapper retry %d/%d", attempt_num, settings.AI_MAX_RETRIES
                    )
                result = await _call_claude_once(api_key, raw_json)

    except RetryableAIError as exc:
        logger.error(
            "AI mapper exhausted all retries (category=%s): %s", exc.category.value, exc
        )
    except PermanentAIError as exc:
        logger.error(
            "AI mapper permanent failure (category=%s): %s", exc.category.value, exc
        )
    except Exception as exc:
        logger.exception("AI mapper unexpected error: %s", exc)

    return result if result is not None else _build_fallback(raw_json)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_text(api_response: dict) -> str:
    """Pull the text string out of Claude's content block array."""
    for block in api_response.get("content", []):
        if block.get("type") == "text":
            return block["text"].strip()
    raise PermanentAIError(
        AIErrorCategory.PARSE_ERROR,
        "No text block found in Claude API response.",
    )


def _build_fallback(raw_json: dict) -> StandardEvent:
    """Return a safe fallback ``StandardEvent`` when AI mapping fails."""
    logger.warning("Using fallback mapping for unrecognized webhook.")
    return StandardEvent(
        event_type="UNKNOWN",
        actor="unknown",
        payload=raw_json,
        confidence=0.3,
    )
