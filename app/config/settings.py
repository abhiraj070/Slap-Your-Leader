from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="app/.env")

    DB_URL: str

@lru_cache
def get_settings():
    return settings()
