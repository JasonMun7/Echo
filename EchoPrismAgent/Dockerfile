# EchoPrism Agent Service — Cloud Run
# Build context: repo root (.)
FROM python:3.11-slim

WORKDIR /app

# Copy backend app (auth, config, services) and agent service
COPY backend/app /app/backend/app
COPY backend/main.py /app/backend/main.py
COPY EchoPrismAgent/requirements.txt /app/requirements.txt
COPY EchoPrismAgent/main.py /app/main.py
COPY EchoPrismAgent/routers /app/routers
COPY EchoPrismAgent/agent /app/agent

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080
ENV PORT=8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
