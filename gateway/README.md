# Meteria Gateway Companion Service

Python-based edge gateway for Raspberry Pi devices. It buffers readings locally in SQLite and forwards batches to Meteria when connectivity is available.

## Features

- Python 3 runtime
- Dockerized deployment
- Offline-first buffering with SQLite
- YAML config-driven setup
- Secure gateway token authentication (`x-gateway-token`)
- Exponential backoff retry strategy
- Structured JSON logs
- Lightweight scheduler loop
- Health endpoint: `GET /health` or `GET /status`

## Folder layout

```txt
gateway/
  app/
    main.py
    config.py
    logger.py
    db.py
    sender.py
    scheduler.py
    models.py
    adapters/
      base.py
      wmbus.py
      modbus_tcp.py
      mqtt_adapter.py
      csv_drop.py
  tests/
  Dockerfile
  docker-compose.yml
  README.md
  config.example.yaml
```

## Runtime behavior

1. Adapters poll/receive local readings.
2. Readings are normalized into a shared schema.
3. Gateway persists normalized readings to SQLite.
4. Sender uploads unsent rows in configurable batches.
5. Successful uploads are marked `sent`.
6. Failed uploads are retried with exponential backoff.
7. Permanent client errors are marked `failed`.

## Normalized reading format

- `meter_external_id`
- `timestamp`
- `value`
- `unit`
- `quality_flag`
- `source`

## Adapter stubs and extension path

### Wireless M-Bus (`wmbus.py`)
Current: synthetic meter increments from config.

Extension:
- integrate real receiver/decoder
- map telegrams to `NormalizedReading`
- preserve config-driven meter mapping

### Modbus TCP (`modbus_tcp.py`)
Current: synthetic register-like values.

Extension:
- use `pymodbus`
- read real registers from devices
- apply scaling/endianness mapping

### MQTT (`mqtt_adapter.py`)
Current: optional live subscription if broker and `paho-mqtt` configured.

Extension:
- enforce topic routing and ACL
- support multiple payload schemas/versioning

### CSV drop (`csv_drop.py`)
Current: consumes CSV files from a watch folder and archives processed files.

Extension:
- schema/version validation
- signed file ingestion
- strict reconciliation and dead-letter handling

## Local development

```bash
cd gateway
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config.example.yaml config.yaml
python -m app.main --config ./config.yaml
```

## Docker run

```bash
cd gateway
docker compose up --build
```

## Tests

```bash
cd gateway
python -m unittest discover -s tests -v
```

## Notes on security

- Keep `gateway_token` out of source control.
- Use file permissions (`0600`) for runtime config on Raspberry Pi.
- Rotate gateway tokens regularly in Meteria.
