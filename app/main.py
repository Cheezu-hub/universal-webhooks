"""
Universal Webhook Adapter — application entry-point.

Start with:
    uvicorn app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # Load .env before any settings are read

from fastapi import FastAPI  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402

from app.api.routes import router  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.limiter import limiter  # noqa: E402
from app.db.database import init_db  # noqa: E402
from app.services.queue import start_queue_worker  # noqa: E402
from app.utils.logger import setup_logging  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialise DB + queue worker.  Shutdown: cancel worker."""
    setup_logging(settings.LOG_LEVEL)
    log = logging.getLogger(__name__)

    await init_db()
    log.info("Database initialised.")

    worker_task = await start_queue_worker()
    log.info("Universal Webhook Adapter v2 started.")

    yield  # ← application runs here

    worker_task.cancel()
    try:
        await worker_task
    except Exception:
        pass
    log.info("Universal Webhook Adapter shutting down.")


app = FastAPI(
    title="Universal Webhook Adapter",
    description=(
        "Accepts any webhook payload, verifies its signature, deduplicates it, "
        "and normalises it into a standard schema via Claude AI."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# --- Rate limiting ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# --- Routes ---
app.include_router(router)
