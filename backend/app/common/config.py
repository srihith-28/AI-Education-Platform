from urllib.parse import quote_plus

# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

    # ── App ──────────────────────────────────────────────────────────────────
    app_name: str = "AI Education Platform API"
    app_env: str = "development"
    app_debug: bool = True
    # Comma-separated list of allowed CORS origins (e.g. "https://myapp.vercel.app")
    cors_allowed_origins: str = "*"

    # ── Supabase ─────────────────────────────────────────────────────────────
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    # JWT secret from Supabase dashboard → Settings → API → JWT Secret
    supabase_jwt_secret: str = ""
    supabase_storage_bucket: str = "course-materials"

    # ── PostgreSQL (Supabase Postgres) ────────────────────────────────────────
    # Set DATABASE_URL directly, or use individual components below.
    database_url_override: str = ""
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "postgres"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    # ── Qdrant Cloud ─────────────────────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "course_materials_gemini_2"

    # ── Gemini LLM ───────────────────────────────────────────────────────────
    gemini_api_key: str = ""
    # Fast model: good for chat routing and quick extraction
    gemini_fast_model: str = "gemini-2.5-flash"
    # Quality model: better reasoning, used for complex queries / RAG synthesis
    gemini_quality_model: str = "gemini-2.5-pro"

    # ── Gemini Embeddings ────────────────────────────────────────────────────
    gemini_embed_model: str = "models/gemini-embedding-2"

    # ── Features ─────────────────────────────────────────────────────────────
    feature_personalized_paths: bool = True
    feature_difficulty_adaptation: bool = True
    feature_knowledge_graph: bool = True

    @property
    def database_url(self) -> str:
        """Return Supabase PostgreSQL connection URL.

        Prefer DATABASE_URL_OVERRIDE (full DSN) when set, otherwise build
        from individual POSTGRES_* components.  Railway injects DATABASE_URL
        automatically so we read that via the override field.
        """
        if self.database_url_override:
            # Make sure psycopg driver is used
            url = self.database_url_override
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg://", 1)
            elif url.startswith("postgresql://") and "+psycopg" not in url:
                url = url.replace("postgresql://", "postgresql+psycopg://", 1)
            return url

        encoded_password = quote_plus(self.postgres_password)
        return (
            f"postgresql+psycopg://{self.postgres_user}:{encoded_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        if self.cors_allowed_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]


settings = Settings()