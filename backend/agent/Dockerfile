# Use official Playwright image (Ubuntu-based) to avoid Debian Trixie package issues
FROM mcr.microsoft.com/playwright/python:v1.52.0-noble

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV HEADLESS=true
CMD ["python", "run_workflow_agent.py"]
