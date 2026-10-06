from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/ -> project root, where the checkpoints sit.
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "dermascan"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Trained weights. Point these at wherever the checkpoints live; the API
    # degrades gracefully to placeholder output when a file is missing.
    segmentation_model_path: Path = PROJECT_ROOT / "best_model.pth"
    classifier_model_path: Path = PROJECT_ROOT / "best_model_medlit_classif_HAM.pth"
    segmentation_threshold: float = 0.5
    # CPU inference: leaving this unbounded lets torch thrash on a dev machine.
    torch_threads: int = 4

    # Chatbot LLM. Used only to phrase an answer from documents the text index
    # retrieved; disable it and the chatbot falls back to returning those
    # documents verbatim, exactly as it behaved before.
    llm_enabled: bool = True
    llm_model: str = "Qwen/Qwen2.5-0.5B-Instruct"
    # Answers are meant to be 1-2 sentences; this is a ceiling, not a target.
    llm_max_tokens: int = 90
    # Two keeps the answer on topic; a third document pulled it off onto
    # whatever else shared a keyword.
    llm_context_docs: int = 2

    # Connection tuning. Defaults suit a local mongod; raise the timeouts a
    # little when pointing at an Atlas cluster over the public internet.
    mongo_server_selection_timeout_ms: int = 5000
    mongo_connect_timeout_ms: int = 5000
    mongo_max_pool_size: int = 20

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
