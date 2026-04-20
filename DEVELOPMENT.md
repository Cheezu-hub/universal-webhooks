# Development Guide

This document provides more technical details for developers working on the Universal Webhook Adapter.

## 🛠️ Backend Development

### Database
The project uses SQLite with SQLAlchemy for simplicity in development.
- The database file `webhooks.db` will be created in the root directory on first run.

### Background Worker
The background worker is integrated into the FastAPI application lifecycle. It runs as an `asyncio` task and processes webhooks from an internal queue.
- To adjust the number of workers or queue size, see `app/core/config.py`.

### AI Normalization
The normalization logic resides in `app/services/ai_mapper.py`. It uses Groq (Llama 3) to transform raw JSON.
- If you need to update the target schema, modify `app/schemas/event_schema.py`.

## 💻 Frontend Development

The frontend is a Vite + React application located in the `frontend` directory.

### Environment
Ensure `VITE_API_URL` in `frontend/.env` points to your running FastAPI backend (default: `http://localhost:8000`).

### UI Components
- Components are built using **Tailwind CSS** and **Lucide React** for icons.
- Use `frontend/src/utils/cn.js` for dynamic class merging.

## 🧪 Testing

### Manual Testing via Simulation Hub
The dashboard includes a "Simulation Hub" where you can trigger mock Stripe and GitHub webhooks. This is the fastest way to verify the end-to-end flow.

### Manual Testing via CLI
You can simulate a webhook using `curl`:
```bash
curl -X POST http://localhost:8000/universal-webhook \
     -H "Content-Type: application/json" \
     -d '{"event": "test", "data": {"foo": "bar"}}'
```
