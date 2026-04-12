"""
API routes — Universal Webhook Adapter (v2).

POST /universal-webhook
    • Signature verification  (Stripe / GitHub via Dependency)
    • Rate limiting            (100 req/min per IP via slowapi)
    • Idempotency check        (returns cached result for duplicate keys)
    • Persists raw record      (status = queued)
    • Enqueues for background  processing
    • Returns 202 immediately

GET /webhooks/{request_id}
    • Returns current status + normalized payload once processed

GET /health
    • Liveness probe
"""

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limiter import limiter
from app.core.security import verify_webhook_signature
from app.db.database import get_db
from app.db.models import Webhook
from app.schemas.event_schema import WebhookRecord, WebhookResponse
from app.services.idempotency import extract_idempotency_key, find_duplicate
from app.services.queue import enqueue_webhook

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# POST /universal-webhook
# ---------------------------------------------------------------------------

@router.post("/universal-webhook", response_model=WebhookResponse, status_code=202)
@limiter.limit("100/minute")
async def receive_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    provider: str = Depends(verify_webhook_signature),
) -> WebhookResponse:
    """
    Accept any JSON webhook payload.

    Immediately stores the raw payload, queues it for AI-powered normalisation,
    and returns ``202 Accepted``.  Poll ``GET /webhooks/{request_id}`` for the
    processing result.
    """
    request_id = str(uuid.uuid4())
    logger.info("Received webhook | request_id=%s provider=%s", request_id, provider)

    # --- 1. Parse body -------------------------------------------------------
    try:
        raw_payload: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")

    # --- 2. Idempotency check ------------------------------------------------
    idempotency_key = extract_idempotency_key(request, raw_payload)
    duplicate = await find_duplicate(db, idempotency_key)

    if duplicate:
        logger.info(
            "Duplicate webhook detected | idempotency_key=%s existing_request_id=%s",
            idempotency_key,
            duplicate.request_id,
        )
        return WebhookResponse(
            request_id=duplicate.request_id,
            status=duplicate.status,
            message="Duplicate webhook — returning existing result.",
        )

    # --- 3. Persist raw record (status = queued) -----------------------------
    captured_headers = {k: v for k, v in request.headers.items()}
    webhook = Webhook(
        request_id=request_id,
        idempotency_key=idempotency_key,
        provider=provider,
        headers=json.dumps(captured_headers),
        raw_payload=json.dumps(raw_payload),
        status="queued",
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    logger.info("Webhook stored | request_id=%s id=%d", request_id, webhook.id)

    # --- 4. Enqueue for background processing --------------------------------
    accepted = await enqueue_webhook(webhook.id, raw_payload)
    if not accepted:
        # Queue was full — mark failed immediately so the caller knows
        webhook.status = "failed"
        webhook.error_detail = "Processing queue full — please retry later."
        await db.commit()
        raise HTTPException(
            status_code=503,
            detail="Service overloaded. Processing queue is full — please retry.",
        )

    logger.info("Webhook queued | request_id=%s", request_id)
    return WebhookResponse(
        request_id=request_id,
        status="queued",
        message="Webhook accepted and queued for processing. Poll GET /webhooks/{request_id} for result.",
    )


# ---------------------------------------------------------------------------
# GET /webhooks/{request_id}
# ---------------------------------------------------------------------------

@router.get("/webhooks/{request_id}", response_model=WebhookRecord)
async def get_webhook(request_id: str, db: AsyncSession = Depends(get_db)) -> WebhookRecord:
    """Retrieve a stored webhook record by its ``request_id``."""
    result = await db.execute(select(Webhook).where(Webhook.request_id == request_id))
    webhook = result.scalar_one_or_none()

    if not webhook:
        raise HTTPException(status_code=404, detail=f"Webhook '{request_id}' not found.")

    normalized = json.loads(webhook.normalized_payload) if webhook.normalized_payload else None

    return WebhookRecord(
        request_id=webhook.request_id,
        status=webhook.status,
        provider=webhook.provider,
        confidence=webhook.confidence,
        normalized_payload=normalized,
        retry_count=webhook.retry_count,
        error_detail=webhook.error_detail,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@router.get("/health")
async def health_check() -> dict:
    """Liveness probe."""
    return {"status": "ok", "service": "universal-webhook-adapter", "version": "2.0.0"}
