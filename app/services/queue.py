"""
Background webhook processing queue.

Architecture
------------
* An ``asyncio.Queue`` holds pending jobs in memory.
* A single background ``asyncio.Task`` drains the queue one item at a time.
* Each job carries ``(webhook_id, raw_payload, attempt_number)``.
* On failure the worker re-queues the job after an exponential delay, up to
  ``settings.MAX_RETRY_ATTEMPTS`` total attempts.
* On startup ``recover_queued_webhooks`` re-enqueues any rows that were left
  in ``queued`` or ``processing`` state from a previous crashed run.
"""

import asyncio
import json
import logging
from typing import Any, TypedDict

from sqlalchemy import select

from app.core.config import settings
from app.db.database import AsyncSessionLocal
from app.db.models import Webhook

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Queue and job type
# ---------------------------------------------------------------------------

class _Job(TypedDict):
    webhook_id: int
    raw_payload: dict[str, Any]
    attempt: int          # 0-indexed


_queue: asyncio.Queue[_Job] = asyncio.Queue()


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_queue_size() -> int:
    """Return the number of items currently in the background queue."""
    return _queue.qsize()

async def enqueue_webhook(webhook_id: int, raw_payload: dict[str, Any], attempt: int = 0) -> bool:
    """
    Add a job to the in-memory processing queue.

    Returns ``True`` on success, ``False`` if the queue is full.
    """
    if _queue.qsize() >= settings.MAX_QUEUE_SIZE:
        logger.error(
            "Queue full (size=%d) — dropping webhook id=%s",
            settings.MAX_QUEUE_SIZE,
            webhook_id,
        )
        return False

    job: _Job = {"webhook_id": webhook_id, "raw_payload": raw_payload, "attempt": attempt}
    await _queue.put(job)
    logger.info("Enqueued webhook id=%d (attempt=%d, queue_size=%d)", webhook_id, attempt, _queue.qsize())
    return True


async def recover_queued_webhooks() -> int:
    """
    On startup, re-enqueue any webhooks that were left in ``queued`` or
    ``processing`` state by a previous crashed process.

    Returns the number of webhooks re-enqueued.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Webhook).where(Webhook.status.in_(["queued", "processing"]))
        )
        stale = result.scalars().all()

        count = 0
        for wh in stale:
            try:
                raw = json.loads(wh.raw_payload)
                enqueued = await enqueue_webhook(wh.id, raw, attempt=wh.retry_count)
                if enqueued:
                    wh.status = "queued"
                    count += 1
            except Exception as exc:
                logger.error("Recovery failed for webhook id=%d: %s", wh.id, exc)

        if count:
            await db.commit()
            logger.info("Recovered %d stale webhook(s) from previous run.", count)

    return count


# ---------------------------------------------------------------------------
# Worker internals
# ---------------------------------------------------------------------------

async def _process_job(job: _Job) -> None:
    """Attempt to process one queued job, re-queuing on transient failure."""
    # Lazy import to avoid circular dependencies at module load time
    from app.services.ai_mapper import map_webhook_to_standard

    webhook_id = job["webhook_id"]
    raw_payload = job["raw_payload"]
    attempt = job["attempt"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
        webhook = result.scalar_one_or_none()

        if webhook is None:
            logger.error("Queue: webhook id=%d not found in DB — skipping.", webhook_id)
            return

        webhook.status = "processing"
        webhook.retry_count = attempt
        await db.commit()

        try:
            event = await map_webhook_to_standard(raw_payload)
            payload_str = json.dumps(event.model_dump())
            webhook.normalized_payload = payload_str
            webhook.confidence = event.confidence
            webhook.status = "processed"
            webhook.error_detail = None
            
            # --- Outbound Delivery ---
            if settings.OUTBOUND_TARGET_URL:
                webhook.outbound_status = "pending"
                await db.commit() # Save normalized state before outbound attempt
                
                logger.info(f"Queue: attempting outbound delivery for webhook id={webhook_id} to {settings.OUTBOUND_TARGET_URL}")
                try:
                    # Simple inline retry for outbound delivery
                    import httpx
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        # try up to OUTBOUND_MAX_RETRIES 
                        for ob_attempt in range(settings.OUTBOUND_MAX_RETRIES):
                            try:
                                resp = await client.post(
                                    settings.OUTBOUND_TARGET_URL, 
                                    json={"event": event.model_dump(), "original_id": webhook.request_id}
                                )
                                resp.raise_for_status()
                                webhook.outbound_status = "delivered"
                                webhook.outbound_error = None
                                logger.info(f"Queue: outbound delivery successful for webhook id={webhook_id}")
                                break # Success
                            except httpx.HTTPError as h_err:
                                if ob_attempt == settings.OUTBOUND_MAX_RETRIES - 1:
                                    raise h_err
                                await asyncio.sleep(2 * (ob_attempt + 1)) # Simple backoff
                                
                except Exception as ob_exc:
                    logger.error(f"Queue: outbound delivery failed for webhook id={webhook_id}: {ob_exc}")
                    webhook.outbound_status = "delivery_failed"
                    webhook.outbound_error = str(ob_exc)
            
            await db.commit()
            logger.info(
                "Queue: completed processing webhook id=%d event_type=%s confidence=%.2f",
                webhook_id,
                event.event_type,
                event.confidence,
            )

        except Exception as exc:
            logger.error(
                "Queue: webhook id=%d attempt=%d failed: %s",
                webhook_id,
                attempt,
                exc,
            )

            if attempt < settings.MAX_RETRY_ATTEMPTS - 1:
                delay = settings.RETRY_DELAY_BASE ** (attempt + 1)
                logger.info(
                    "Queue: scheduling retry for webhook id=%d in %.1fs (attempt %d/%d)",
                    webhook_id,
                    delay,
                    attempt + 2,
                    settings.MAX_RETRY_ATTEMPTS,
                )
                webhook.status = "queued"
                webhook.error_detail = str(exc)
                await db.commit()

                # Sleep outside the DB session to free the connection
                await asyncio.sleep(delay)
                await enqueue_webhook(webhook_id, raw_payload, attempt + 1)

            else:
                logger.error(
                    "Queue: webhook id=%d exhausted all %d retries — marking failed.",
                    webhook_id,
                    settings.MAX_RETRY_ATTEMPTS,
                )
                webhook.status = "failed"
                webhook.error_detail = str(exc)
                await db.commit()


async def _worker_loop() -> None:
    """Continuously drain the queue until cancelled."""
    logger.info("Queue worker started.")
    while True:
        try:
            job = await _queue.get()
            try:
                await _process_job(job)
            finally:
                _queue.task_done()
        except asyncio.CancelledError:
            logger.info("Queue worker cancelled — shutting down.")
            break
        except Exception as exc:
            logger.exception("Queue worker unexpected error: %s", exc)


# ---------------------------------------------------------------------------
# Public startup helper
# ---------------------------------------------------------------------------

async def start_queue_worker() -> asyncio.Task:
    """
    Recover stale jobs from the DB, then start the background worker task.

    Returns the running ``asyncio.Task`` so the caller can cancel it on shutdown.
    """
    await recover_queued_webhooks()
    task = asyncio.create_task(_worker_loop(), name="webhook-queue-worker")
    return task
