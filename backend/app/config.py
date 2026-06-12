# backend/app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "greenhouse-dt"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/greenhouse"
    
    # Orion-LD
    orion_ld_url: str = "http://orion-ld-service:1026"
    
    # Redis (for ARQ and state)
    redis_url: str = "redis://redis-service:6379/0"
    
    # PostgreSQL (admin_platform for tenant_limits)
    postgres_url: str = ""  # MANDATORY — fail at startup if not set
    
    # MinIO (for COG storage in later phases)
    minio_endpoint: str = "http://minio-service:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "nekazari-greenhouse"
    
    # API gateway
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://nekazari.robotika.cloud",
    ]
    
    # Internal service secret (for /internal/ endpoints)
    internal_service_secret: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

settings = Settings()
