from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- AI Provider ---
    AI_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # --- Webhook signature secrets (leave blank to skip verification) ---
    STRIPE_WEBHOOK_SECRET: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""

    # --- Rate limiting ---
    RATE_LIMIT: str = "100/minute"       # Applied per remote IP

    # --- Background queue / retry ---
    MAX_QUEUE_SIZE: int = 1_000          # Max in-memory queue depth
    MAX_RETRY_ATTEMPTS: int = 3          # Queue-level retries per webhook
    RETRY_DELAY_BASE: float = 2.0        # Exponential backoff base (seconds)

    # --- AI mapper ---
    AI_TIMEOUT_SECONDS: float = 10.0
    AI_MAX_RETRIES: int = 3              # API-level retries (tenacity)

    # --- Misc ---
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()
