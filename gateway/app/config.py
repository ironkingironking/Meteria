from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict

import yaml


@dataclass
class MeteriaApiConfig:
    base_url: str = "http://meteria-api:4000"
    ingestion_path: str = "/api/v1/ingestion/readings"
    gateway_serial: str = "rpi-gateway-001"
    gateway_token: str = ""
    timeout_seconds: int = 10
    batch_size: int = 200
    max_retries: int = 15
    retry_base_seconds: int = 5
    max_backoff_seconds: int = 300


@dataclass
class StorageConfig:
    sqlite_path: str = "/data/gateway.db"


@dataclass
class SchedulerConfig:
    poll_interval_seconds: int = 10
    upload_interval_seconds: int = 8
    heartbeat_interval_seconds: int = 30
    status_host: str = "0.0.0.0"
    status_port: int = 8081


@dataclass
class LoggingConfig:
    level: str = "INFO"


@dataclass
class AdapterConfig:
    enabled: bool = False
    options: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GatewayConfig:
    meteria: MeteriaApiConfig = field(default_factory=MeteriaApiConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    adapters: Dict[str, AdapterConfig] = field(default_factory=dict)

    @staticmethod
    def from_dict(raw: Dict[str, Any]) -> "GatewayConfig":
        meteria = MeteriaApiConfig(**raw.get("meteria", {}))
        storage = StorageConfig(**raw.get("storage", {}))
        scheduler = SchedulerConfig(**raw.get("scheduler", {}))
        logging = LoggingConfig(**raw.get("logging", {}))

        adapters_raw = raw.get("adapters", {})
        adapters: Dict[str, AdapterConfig] = {}
        for key, value in adapters_raw.items():
            value = value or {}
            adapters[key] = AdapterConfig(
                enabled=bool(value.get("enabled", False)),
                options={k: v for k, v in value.items() if k != "enabled"},
            )

        return GatewayConfig(
            meteria=meteria,
            storage=storage,
            scheduler=scheduler,
            logging=logging,
            adapters=adapters,
        )


def load_config(path: str) -> GatewayConfig:
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    config = GatewayConfig.from_dict(raw)
    if not config.meteria.gateway_token:
        raise ValueError("meteria.gateway_token is required")

    return config
