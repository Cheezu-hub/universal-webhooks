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
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limiter import limiter
from app.core.security import verify_webhook_signature
from app.db.database import get_db
from app.db.models import Webhook
from app.schemas.event_schema import WebhookRecord, WebhookResponse
from app.services.idempotency import extract_idempotency_key, find_duplicate
from app.services.queue import enqueue_webhook, get_queue_size
from app.services.broadcaster import broadcaster

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
        outbound_status=webhook.outbound_status,
        outbound_error=webhook.outbound_error,
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


# ---------------------------------------------------------------------------
# Dashboard UI Endpoints
# ---------------------------------------------------------------------------

@router.get("/api/webhooks", response_model=list[WebhookRecord])
async def list_webhooks(limit: int = 20, db: AsyncSession = Depends(get_db)) -> list[WebhookRecord]:
    """Fetch the latest webhooks for the dashboard logs view."""
    # Descending order by id or created_at
    result = await db.execute(
        select(Webhook).order_by(Webhook.created_at.desc()).limit(limit)
    )
    webhooks = result.scalars().all()
    
    records = []
    for wh in webhooks:
        normalized = json.loads(wh.normalized_payload) if wh.normalized_payload else None
        records.append(
            WebhookRecord(
                request_id=wh.request_id,
                status=wh.status,
                provider=wh.provider,
                confidence=wh.confidence,
                normalized_payload=normalized,
                retry_count=wh.retry_count,
                error_detail=wh.error_detail,
                outbound_status=wh.outbound_status,
                outbound_error=wh.outbound_error,
                created_at=wh.created_at,
                updated_at=wh.updated_at,
            )
        )
    return records


@router.post("/api/webhooks/{request_id}/replay", response_model=WebhookResponse)
async def replay_webhook(request_id: str, db: AsyncSession = Depends(get_db)) -> WebhookResponse:
    """Manually replay a webhook from the dashboard."""
    result = await db.execute(select(Webhook).where(Webhook.request_id == request_id))
    webhook = result.scalar_one_or_none()

    if not webhook:
        raise HTTPException(status_code=404, detail=f"Webhook '{request_id}' not found.")

    raw_payload = json.loads(webhook.raw_payload)
    
    # Reset status
    webhook.status = "queued"
    webhook.error_detail = None
    webhook.retry_count = 0
    await db.commit()
    
    accepted = await enqueue_webhook(webhook.id, raw_payload)
    if not accepted:
        webhook.status = "failed"
        webhook.error_detail = "Processing queue full — please retry later."
        await db.commit()
        raise HTTPException(
            status_code=503,
            detail="Queue is full. Replay failed.",
        )

    logger.info("Webhook replayed | request_id=%s", request_id)
    return WebhookResponse(
        request_id=request_id,
        status="queued",
        message="Webhook replayed successfully.",
    )


# ---------------------------------------------------------------------------
# GET /api/events/stream  — Server-Sent Events
# ---------------------------------------------------------------------------

@router.get("/api/events/stream")
async def events_stream(request: Request):
    """SSE endpoint — push live webhook updates to the dashboard."""
    async def _generator():
        async for chunk in broadcaster.subscribe():
            if await request.is_disconnected():
                break
            yield chunk

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /api/v1/simulate  — flexible custom-JSON simulation
# ---------------------------------------------------------------------------

@router.post("/api/v1/simulate", response_model=WebhookResponse)
async def simulate_custom(
    payload: dict,
    provider: str = "custom",
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Simulate any arbitrary JSON as a webhook (for the Custom JSON tab)."""
    request_id = str(uuid.uuid4())
    webhook = Webhook(
        request_id=request_id,
        idempotency_key=f"custom_{request_id}",
        provider=provider,
        headers=json.dumps({"x-simulated": "true", "x-provider": provider}),
        raw_payload=json.dumps(payload),
        status="queued",
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)

    accepted = await enqueue_webhook(webhook.id, payload)
    if not accepted:
        webhook.status = "failed"
        await db.commit()
        raise HTTPException(status_code=503, detail="Queue is full.")

    await broadcaster.publish({
        "type": "webhook_received",
        "request_id": request_id,
        "provider": provider,
        "status": "queued",
    })

    return WebhookResponse(
        request_id=request_id,
        status="queued",
        message=f"Custom '{provider}' webhook created and queued.",
    )


@router.get("/api/system/status")
async def system_status(db: AsyncSession = Depends(get_db)) -> dict:
    """Return metrics for the frontend Dashboard."""
    from sqlalchemy import func
    
    # Count webhooks by status
    result = await db.execute(
        select(Webhook.status, func.count()).group_by(Webhook.status)
    )
    counts = dict(result.all())
    
    return {
        "status": "Healthy",
        "queue_size": get_queue_size(),
        "processed": counts.get("processed", 0),
        "failed": counts.get("failed", 0),
        "total": sum(counts.values())
    }

@router.post("/api/webhooks/simulate", response_model=WebhookResponse)
async def simulate_webhook(
    provider: str = "stripe",
    db: AsyncSession = Depends(get_db)
) -> WebhookResponse:
    """Trigger a simulated mock webhook for testing."""
    import time
    request_id = str(uuid.uuid4())
    
    if provider.lower() == "github":
        raw_payload = {
            "ref": "refs/heads/main",
            "repository": {"name": "universal-webhooks", "full_name": "Cheezu-hub/universal-webhooks"},
            "pusher": {"name": "Cheezu", "email": "cheezu@example.com"},
            "commits": [{"id": "a1b2c3d4", "message": "Demo commit for simulation", "timestamp": time.time()}]
        }
        prov = "github"
    elif provider.lower() == "shopify":
        raw_payload = {
            "id": int(time.time() * 1000),
            "email": "customer@demo.com",
            "financial_status": "paid",
            "fulfillment_status": None,
            "total_price": "99.99",
            "currency": "USD",
            "line_items": [
                {"title": "Demo Product", "quantity": 1, "price": "99.99"}
            ],
            "shipping_address": {
                "first_name": "Jane",
                "last_name": "Doe",
                "city": "New York",
                "country": "US"
            },
            "created_at": f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}"
        }
        prov = "shopify"
    else:
        # Default to Stripe mock
        raw_payload = {
            "id": f"evt_test_{uuid.uuid4().hex[:8]}",
            "object": "event",
            "type": "payment_intent.succeeded",
            "created": int(time.time()),
            "data": {
                "object": {
                    "id": f"pi_test_{uuid.uuid4().hex[:8]}",
                    "amount": 2500,
                    "currency": "usd",
                    "status": "succeeded",
                    "receipt_email": "demo@hackathon.com"
                }
            }
        }
        prov = "stripe"

    webhook = Webhook(
        request_id=request_id,
        idempotency_key=f"sim_{request_id}",
        provider=prov,
        headers=json.dumps({"x-simulated": "true"}),
        raw_payload=json.dumps(raw_payload),
        status="queued",
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    
    accepted = await enqueue_webhook(webhook.id, raw_payload)
    if not accepted:
        webhook.status = "failed"
        webhook.error_detail = "Processing queue full."
        await db.commit()
        raise HTTPException(status_code=503, detail="Queue is full.")

    return WebhookResponse(
        request_id=request_id,
        status="queued",
        message=f"Simulated {prov} webhook created and queued.",
    )
