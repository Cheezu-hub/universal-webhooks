"""
Provider-specific webhook signature verification.

Supported providers
-------------------
* Stripe  — HMAC-SHA256 with timestamp-based replay protection
              Header: ``Stripe-Signature: t=<ts>,v1=<hex>``
* GitHub  — HMAC-SHA256
              Header: ``X-Hub-Signature-256: sha256=<hex>``

If the relevant secret is not configured the check is skipped (returns True),
allowing unsigned webhooks from unknown providers to pass through.
"""

import hashlib
import hmac
import logging
import time

from fastapi import Header, HTTPException, Request

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Stripe
# ---------------------------------------------------------------------------

def verify_stripe_signature(
    payload_bytes: bytes,
    sig_header: str,
    secret: str,
    tolerance_seconds: int = 300,
) -> bool:
    """
    Verify a Stripe ``Stripe-Signature`` header.

    The header format is:  ``t=<unix_ts>,v1=<hmac_hex>[,v1=<hmac_hex>...]``
    Signed payload  :      ``<timestamp>.<raw_body>``
    """
    if not secret:
        return True  # Verification disabled — secret not configured

    try:
        parts: dict[str, str] = {}
        for kv in sig_header.split(","):
            k, _, v = kv.partition("=")
            parts.setdefault(k.strip(), v.strip())

        timestamp = parts.get("t", "")
        signature = parts.get("v1", "")

        if not timestamp or not signature:
            logger.warning("Stripe signature header malformed: %s", sig_header)
            return False

        # Replay-attack guard
        age = abs(int(time.time()) - int(timestamp))
        if age > tolerance_seconds:
            logger.warning("Stripe signature timestamp too old (%ds)", age)
            return False

        signed_payload = f"{timestamp}.".encode() + payload_bytes
        expected = hmac.new(
            secret.encode(),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected, signature)

    except Exception as exc:
        logger.error("Stripe signature verification error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------

def verify_github_signature(
    payload_bytes: bytes,
    sig_header: str,
    secret: str,
) -> bool:
    """
    Verify a GitHub ``X-Hub-Signature-256`` header.

    Header format: ``sha256=<hmac_hex>``
    """
    if not secret:
        return True  # Verification disabled

    try:
        if not sig_header.startswith("sha256="):
            logger.warning("GitHub signature header missing 'sha256=' prefix: %s", sig_header)
            return False

        provided = sig_header.removeprefix("sha256=")
        expected = hmac.new(
            secret.encode(),
            payload_bytes,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected, provided)

    except Exception as exc:
        logger.error("GitHub signature verification error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# FastAPI dependency — auto-detects provider, raises 401 on bad signature
# ---------------------------------------------------------------------------

async def verify_webhook_signature(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    stripe_signature: str | None = Header(default=None),
) -> str:
    """
    Auto-detect webhook provider from headers and verify the signature.

    Returns the detected provider name: ``'stripe'``, ``'github'``, or
    ``'unknown'``.  Raises ``HTTP 401`` if a recognised signature header is
    present but the HMAC check fails.

    Note: ``request.body()`` caches the body internally, so subsequent calls
    to ``request.json()`` in the route handler work without re-reading the
    stream.
    """
    from app.core.config import settings  # lazy import avoids circular dependency

    raw_body: bytes = await request.body()

    if stripe_signature:
        if not verify_stripe_signature(raw_body, stripe_signature, settings.STRIPE_WEBHOOK_SECRET):
            logger.warning("Invalid Stripe webhook signature")
            raise HTTPException(status_code=401, detail="Invalid Stripe webhook signature.")
        logger.debug("Stripe signature verified")
        return "stripe"

    if x_hub_signature_256:
        if not verify_github_signature(raw_body, x_hub_signature_256, settings.GITHUB_WEBHOOK_SECRET):
            logger.warning("Invalid GitHub webhook signature")
            raise HTTPException(status_code=401, detail="Invalid GitHub webhook signature.")
        logger.debug("GitHub signature verified")
        return "github"

    # No recognised signature header — allow through as unknown provider
    return "unknown"
