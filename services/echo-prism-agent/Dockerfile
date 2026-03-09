# EchoPrism Agent Service — Cloud Run
# Build context: repo root (.)
FROM python:3.11-slim

WORKDIR /app

# Copy backend (agent router, app.auth, echo_prism, etc.) and service
COPY backend /app/backend
COPY services/echo-prism-agent/requirements.txt /app/requirements.txt
COPY services/echo-prism-agent/main.py /app/main.py

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080
ENV PORT=8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
