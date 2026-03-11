from __future__ import annotations

import argparse
import signal
import sys

from .adapters.csv_drop import CsvDropAdapter
from .adapters.modbus_tcp import ModbusTcpAdapter
from .adapters.mqtt_adapter import MqttAdapter
from .adapters.wmbus import WirelessMBusAdapter
from .config import load_config
from .db import GatewayDatabase
from .logger import build_logger
from .scheduler import GatewayScheduler
from .sender import MeteriaSender


def build_adapters(config, logger):
    adapter_instances = []

    wmbus_cfg = config.adapters.get("wmbus")
    if wmbus_cfg and wmbus_cfg.enabled:
        adapter_instances.append(WirelessMBusAdapter(wmbus_cfg.options, logger))

    modbus_cfg = config.adapters.get("modbus_tcp")
    if modbus_cfg and modbus_cfg.enabled:
        adapter_instances.append(ModbusTcpAdapter(modbus_cfg.options, logger))

    mqtt_cfg = config.adapters.get("mqtt")
    if mqtt_cfg and mqtt_cfg.enabled:
        adapter_instances.append(MqttAdapter(mqtt_cfg.options, logger))

    csv_cfg = config.adapters.get("csv_drop")
    if csv_cfg and csv_cfg.enabled:
        adapter_instances.append(CsvDropAdapter(csv_cfg.options, logger))

    return adapter_instances


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Meteria companion gateway")
    parser.add_argument("--config", default="/app/config.yaml", help="Path to gateway YAML config")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config(args.config)
    logger = build_logger(config.logging.level)

    db = GatewayDatabase(config.storage.sqlite_path)
    sender = MeteriaSender(db=db, config=config.meteria, logger=logger)
    adapters = build_adapters(config, logger)

    if not adapters:
        logger.warning("no adapters enabled; gateway will only retry local buffer")

    scheduler = GatewayScheduler(
        adapters=adapters,
        db=db,
        sender=sender,
        config=config.scheduler,
        logger=logger,
    )

    def shutdown(_signum, _frame):
        logger.info("shutdown signal received")
        scheduler.stop()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        scheduler.run_forever()
        return 0
    except Exception as exc:
        logger.exception("gateway crashed", extra={"error": str(exc)})
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
