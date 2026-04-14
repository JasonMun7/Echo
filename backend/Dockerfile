# Build from repository root: docker build -f backend/Dockerfile .
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
# Shared EchoPrism integration connectors (see README Composio section)
COPY agent/echo_prism_agent /app/agent/echo_prism_agent

ENV PYTHONPATH=/app/agent

EXPOSE 8080
ENV PORT=8080

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
