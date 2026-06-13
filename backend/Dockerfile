# backend/Dockerfile
# backend/Dockerfile
FROM python:3.12-slim

# rasterio/ GDAL runtime dependencies
# Runtime deps for rasterio (bundled GDAL wheels)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 \
    procps \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

EXPOSE 8420

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8420"]
