# Echo Prism Agent Service — Cloud Run (LangGraph + OpenRouter + Gemini)
# Build context: repo root (.)
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1
# Routers import `app.*` from copied backend/app; package root is backend/.
ENV PYTHONPATH=/app/backend

WORKDIR /app

COPY backend/app /app/backend/app
COPY backend/main.py /app/backend/main.py
COPY agent/requirements.txt /app/requirements.txt
COPY agent/main.py /app/main.py
COPY agent/routers /app/routers
COPY agent/echo_prism_agent /app/echo_prism_agent

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080
ENV PORT=8080

# Cloud Run sets PORT; must bind to that port (default 8080).
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
