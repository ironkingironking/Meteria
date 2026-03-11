FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /gateway

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY config.example.yaml ./config.example.yaml

RUN mkdir -p /data/drop /data/processed

EXPOSE 8081

CMD ["python", "-m", "app.main", "--config", "/gateway/config.yaml"]
