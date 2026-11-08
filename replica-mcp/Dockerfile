FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    REPLICA_SKILLS_ROOT=/opt/replica-skill \
    WORKSPACE_ROOT=/tmp/replica-workspace

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

RUN git clone --depth 1 https://github.com/Jakeschincariol/replica-skill.git /opt/replica-skill

COPY server.py .
RUN mkdir -p /tmp/replica-workspace

EXPOSE 10000
CMD ["python", "server.py"]
