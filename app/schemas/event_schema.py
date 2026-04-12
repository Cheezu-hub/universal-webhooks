from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class StandardEvent(BaseModel):
    """The normalized output schema every webhook must conform to."""

    event_type: str = Field(..., description="Short uppercase event identifier, e.g. PAYMENT_SUCCESS")
    actor: str = Field(..., description="User identifier: email, username, id, or 'unknown'")
    payload: dict = Field(..., description="Structured, cleaned payload data")
    confidence: float = Field(..., ge=0.0, le=1.0, description="AI confidence score between 0 and 1")

    @field_validator("event_type")
    @classmethod
    def event_type_uppercase(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("actor")
    @classmethod
    def actor_fallback(cls, v: str) -> str:
        return v.strip() or "unknown"


class WebhookResponse(BaseModel):
    """Immediate response returned to the caller after a webhook is accepted."""

    request_id: str
    status: str
    event: StandardEvent | None = None
    message: str | None = None


class WebhookRecord(BaseModel):
    """Full webhook record returned by GET /webhooks/{request_id}."""

    request_id: str
    status: str
    provider: str | None
    confidence: float | None
    normalized_payload: dict | None
    retry_count: int
    error_detail: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
