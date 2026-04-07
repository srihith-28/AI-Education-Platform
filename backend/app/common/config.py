from pathlib import Path
from urllib.parse import quote_plus

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

    # App Config
    app_name: str = "AI Education Platform API"
    app_env: str = "development"
    app_debug: bool = True
    app_secret_key: str = "change-me"
    app_jwt_algorithm: str = "HS256"
    app_access_token_expire_minutes: int = 120

    # PostgreSQL Config
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "ai_education"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    # Ollama Config
    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.1"
    ollama_fast_chat_model: str = "llama3"
    ollama_ultra_fast_chat_model: str = "phi3:mini"
    ollama_quality_chat_model: str = "llama3"
    ollama_embed_model: str = "nomic-embed-text"

    # Storage
    chroma_persist_dir: str = "./storage/chroma"
    material_storage_dir: str = "./storage/materials"

    # Features
    feature_personalized_paths: bool = True
    feature_difficulty_adaptation: bool = True
    feature_knowledge_graph: bool = True

    @property
    def database_url(self) -> str:
        # ✅ Encode password to handle special characters like @
        encoded_password = quote_plus(self.postgres_password)

        return (
            f"postgresql+psycopg2://{self.postgres_user}:{encoded_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    def ensure_storage_dirs(self) -> None:
        Path(self.chroma_persist_dir).mkdir(parents=True, exist_ok=True)
        Path(self.material_storage_dir).mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_storage_dirs()