# backend/Dockerfile
# backend/Dockerfile
FROM python:3.12-slim

RUN useradd -m -u 1000 appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

EXPOSE 8430

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8430"]
