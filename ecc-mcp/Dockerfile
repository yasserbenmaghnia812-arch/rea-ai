FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ECC_ROOT=/opt/ecc

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
RUN git clone --depth 1 https://github.com/affaan-m/ECC.git /opt/ecc

COPY server.py .
EXPOSE 10000
CMD ["python", "server.py"]
