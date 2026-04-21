"""
SSE Broadcaster — fan-out events to all connected dashboard clients.

Usage
-----
    from app.services.broadcaster import broadcaster

    # Publish from anywhere (e.g. queue worker after state change):
    await broadcaster.publish({"type": "webhook_update", "data": {...}})

    # Subscribe in an SSE endpoint:
    async for event in broadcaster.subscribe():
        yield event          # → "data: {...}\\n\\n"
"""

import asyncio
import json
import logging
from typing import AsyncIterator

logger = logging.getLogger(__name__)


class _Broadcaster:
    """Lightweight in-process pub/sub for Server-Sent Events."""

    def __init__(self) -> None:
        self._listeners: set[asyncio.Queue] = set()

    async def publish(self, payload: dict) -> None:
        """Fan-out a JSON-serialisable payload to every subscriber."""
        message = f"data: {json.dumps(payload)}\n\n"
        dead: list[asyncio.Queue] = []
        for q in list(self._listeners):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._listeners.discard(q)

    async def subscribe(self) -> AsyncIterator[str]:
        """
        Async generator — yield SSE-formatted strings until the client disconnects.

        Usage inside a FastAPI ``StreamingResponse``:

            async def _gen(request):
                async for chunk in broadcaster.subscribe():
                    if await request.is_disconnected():
                        break
                    yield chunk
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._listeners.add(q)
        logger.debug("SSE subscriber connected (total=%d)", len(self._listeners))
        try:
            # Send a heartbeat immediately so the browser knows the stream is live
            yield "data: {\"type\": \"connected\"}\n\n"
            while True:
                # Wait for an event or send a keep-alive every 15 s
                try:
                    message = await asyncio.wait_for(q.get(), timeout=15)
                    yield message
                except asyncio.TimeoutError:
                    # Keep-alive comment so proxies don't drop the connection
                    yield ": keep-alive\n\n"
        finally:
            self._listeners.discard(q)
            logger.debug("SSE subscriber disconnected (total=%d)", len(self._listeners))


# Singleton — import this everywhere
broadcaster = _Broadcaster()
