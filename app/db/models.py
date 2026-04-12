import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Webhook(Base):
    """
    Persisted record for every inbound webhook.

    Status lifecycle
    ----------------
    received → queued → processing → processed
                                   ↘ failed  (after MAX_RETRY_ATTEMPTS)
    """

    __tablename__ = "webhooks"

    # --- Identity ---
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(
        String(36), unique=True, index=True,
        default=lambda: str(uuid.uuid4()),
    )
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True,
    )

    # --- Source metadata ---
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)   # stripe | github | unknown
    headers: Mapped[str] = mapped_column(Text)                                  # JSON string
    raw_payload: Mapped[str] = mapped_column(Text)                              # JSON string

    # --- Processing output ---
    normalized_payload: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # --- State ---
    status: Mapped[str] = mapped_column(
        String(20), default="received",
        # received | queued | processing | processed | failed
    )
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
