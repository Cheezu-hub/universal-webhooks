"""
Idempotency layer — prevents duplicate webhook processing.

Key resolution order
--------------------
1. ``X-Webhook-ID`` header
2. ``X-Idempotency-Key`` header
3. ``X-Request-ID`` header
4. GitHub delivery header (``X-GitHub-Delivery``)
5. Stripe event ID  (``raw_payload["id"]`` that starts with ``evt_``)
6. Generic event ID fields in the payload (``id``, ``event_id``, ``messageId``, …)
7. SHA-256 hash of the canonicalised JSON payload (last resort)
"""

import hashlib
import json
import logging
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Webhook

logger = logging.getLogger(__name__)

# Header names to probe, in priority order
_IDEMPOTENCY_HEADERS = [
    "x-webhook-id",
    "x-idempotency-key",
    "x-request-id",
    "x-github-delivery",
]

# Payload keys that commonly hold a unique event identifier
_PAYLOAD_ID_KEYS = ["id", "event_id", "eventId", "messageId", "message_id", "deliveryId"]


def extract_idempotency_key(request: Request, raw_payload: dict[str, Any]) -> str:
    """
    Derive a stable, unique key for this webhook invocation.

    Returns a non-empty string that can be stored as ``Webhook.idempotency_key``.
    """
    # 1–4: Header-based keys
    for header in _IDEMPOTENCY_HEADERS:
        val = request.headers.get(header, "").strip()
        if val:
            logger.debug("Idempotency key from header '%s': %s", header, val)
            return val

    # 5: Stripe event ID
    stripe_id = raw_payload.get("id", "")
    if isinstance(stripe_id, str) and stripe_id.startswith("evt_"):
        logger.debug("Idempotency key from Stripe event id: %s", stripe_id)
        return stripe_id

    # 6: Generic payload ID fields
    for key in _PAYLOAD_ID_KEYS:
        val = raw_payload.get(key)
        if val and isinstance(val, str):
            namespaced = f"payload:{key}:{val}"
            logger.debug("Idempotency key from payload field '%s': %s", key, namespaced)
            return namespaced

    # 7: Hash fallback
    canonical = json.dumps(raw_payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode()).hexdigest()[:40]
    logger.debug("Idempotency key from payload hash: %s", digest)
    return f"hash:{digest}"


async def find_duplicate(
    db: AsyncSession,
    idempotency_key: str,
) -> Webhook | None:
    """Return the existing ``Webhook`` row if this key was already seen, else ``None``."""
    result = await db.execute(
        select(Webhook).where(Webhook.idempotency_key == idempotency_key)
    )
    return result.scalar_one_or_none()
