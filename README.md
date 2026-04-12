# Universal Webhook Adapter v2

Accepts **any** JSON webhook, verifies its signature, deduplicates it, and
normalises the payload into a standard schema via Claude AI — all in a
production-ready FastAPI service.

---

## What's new in v2

| Feature | Detail |
|---|---|
| **Signature Verification** | HMAC-SHA256 for Stripe (`Stripe-Signature`) and GitHub (`X-Hub-Signature-256`). Auto-detected from headers; returns `401` on mismatch. |
| **Background Queue** | `asyncio.Queue` + single worker task. The POST endpoint returns `202` immediately; AI processing happens in the background. |
| **Startup Recovery** | On boot, any `queued` / `processing` rows from a previous crashed run are automatically re-enqueued. |
| **Retry with Back-off** | Queue-level retries (configurable, default 3) with exponential delay (`2^attempt` seconds). Failed webhooks are marked `failed` after exhaustion. |
| **AI Retry (tenacity)** | Transient Claude API errors (rate-limit `429`, `5xx`, timeout, network) are retried up to `AI_MAX_RETRIES` times with exponential back-off. Permanent errors (bad JSON, schema mismatch) fall back immediately. |
| **Idempotency** | Duplicate detection via a resolved key: request headers → GitHub delivery ID → Stripe event ID → payload field IDs → SHA-256 hash. Returns the existing result for duplicates. |
| **Rate Limiting** | `slowapi` — `100/minute` per remote IP by default (configurable via `RATE_LIMIT`). Returns `429 Too Many Requests`. |
| **Structured Project Layout** | All imports use `app.*` package paths; `__init__.py` files present throughout. |

---

## Project structure

```
app/
├── main.py                  # FastAPI app, lifespan, rate-limit middleware
├── api/
│   └── routes.py            # POST /universal-webhook, GET /webhooks/{id}, GET /health
├── core/
│   ├── config.py            # pydantic-settings — all env vars in one place
│   ├── limiter.py           # Shared slowapi Limiter instance
│   └── security.py          # Stripe & GitHub signature verification dependency
├── db/
│   ├── database.py          # Async SQLAlchemy engine + session factory
│   └── models.py            # Webhook ORM model (includes idempotency_key, retry_count, …)
├── schemas/
│   └── event_schema.py      # StandardEvent, WebhookResponse, WebhookRecord
├── services/
│   ├── ai_mapper.py         # Claude API call + tenacity retry + error categorisation
│   ├── idempotency.py       # Key extraction + duplicate lookup
│   └── queue.py             # asyncio queue, background worker, startup recovery
└── utils/
    └── logger.py            # Structured console logging setup
```

---

## Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (required)
# Fill in STRIPE_WEBHOOK_SECRET / GITHUB_WEBHOOK_SECRET (optional)

# 3. Run
uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

---

## Webhook lifecycle

```
POST /universal-webhook
        │
        ▼
  [Signature check]   ──fail──▶  401 Unauthorized
        │
        ▼
  [Idempotency check] ──dup───▶  202 + existing request_id
        │
        ▼
  [Persist raw]       (status = queued)
        │
        ▼
  [Enqueue job]       ──full──▶  503 Service Unavailable
        │
        ▼
  202 Accepted  ◀──────────────  (caller polls GET /webhooks/{request_id})
        │
        ▼  (background worker)
  [AI Mapper]   ──transient──▶  retry up to AI_MAX_RETRIES (tenacity)
        │         ──permanent─▶  fallback UNKNOWN event
        ▼
  [Persist result]    (status = processed | failed)
```

---

## Webhook status values

| Status | Meaning |
|---|---|
| `queued` | Accepted, waiting in queue |
| `processing` | Worker is currently calling the AI |
| `processed` | Normalised successfully |
| `failed` | All retry attempts exhausted |

---

## Configuration reference

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(required)* | Claude API key |
| `STRIPE_WEBHOOK_SECRET` | `""` | Stripe signing secret (`whsec_…`). Leave blank to skip. |
| `GITHUB_WEBHOOK_SECRET` | `""` | GitHub webhook secret. Leave blank to skip. |
| `RATE_LIMIT` | `100/minute` | slowapi limit string, per remote IP |
| `MAX_QUEUE_SIZE` | `1000` | In-memory queue depth before `503` |
| `MAX_RETRY_ATTEMPTS` | `3` | Queue-level retries per webhook |
| `RETRY_DELAY_BASE` | `2.0` | Back-off base: delay = `base^attempt` seconds |
| `AI_TIMEOUT_SECONDS` | `30.0` | Per-request HTTP timeout to Claude API |
| `AI_MAX_RETRIES` | `3` | Claude API retries (tenacity) |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` |

---

## Idempotency key resolution

The adapter resolves a unique key for each inbound request in this order:

1. `X-Webhook-ID` header
2. `X-Idempotency-Key` header
3. `X-Request-ID` header
4. `X-GitHub-Delivery` header
5. Stripe event ID (`raw_payload.id` starting with `evt_`)
6. Common payload fields: `id`, `event_id`, `eventId`, `messageId`
7. SHA-256 hash of the canonicalised JSON payload

---

## Signature verification details

### Stripe

Reads `Stripe-Signature: t=<ts>,v1=<hmac>`. Verifies:
- HMAC-SHA256 of `<timestamp>.<raw_body>` against `STRIPE_WEBHOOK_SECRET`
- Timestamp is within 300 seconds of `now()` (replay-attack guard)

### GitHub

Reads `X-Hub-Signature-256: sha256=<hmac>`. Verifies:
- HMAC-SHA256 of the raw body against `GITHUB_WEBHOOK_SECRET`

Both use `hmac.compare_digest` for constant-time comparison.

---

## AI error categories

The mapper categorises failures before deciding whether to retry:

| Category | Retried? | Cause |
|---|---|---|
| `rate_limit` | ✅ | HTTP 429 |
| `server_error` | ✅ | HTTP 5xx |
| `timeout` | ✅ | `httpx.TimeoutException` |
| `network` | ✅ | `httpx.RequestError` |
| `parse_error` | ❌ | Response is not valid JSON |
| `validation_error` | ❌ | JSON doesn't match `StandardEvent` schema |
| `unknown` | ❌ | HTTP 4xx (not 429) |
