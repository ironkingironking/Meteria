from __future__ import annotations

import json
import queue
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .base import Adapter
from ..models import NormalizedReading


class MqttAdapter(Adapter):
    """
    Placeholder MQTT adapter with optional live mode.

    If `paho-mqtt` and broker settings are available, this adapter subscribes to a topic
    and normalizes incoming JSON payloads. Without broker config it stays idle.

    Expected message JSON keys:
    - meter_external_id
    - timestamp (ISO8601, optional; defaults now)
    - value
    - unit
    - quality_flag (optional)
    """

    def __init__(self, options: Dict[str, Any], logger) -> None:
        super().__init__("mqtt", options, logger)
        self._queue: "queue.Queue[NormalizedReading]" = queue.Queue()
        self._client: Optional[Any] = None

    def start(self) -> None:
        super().start()

        broker_host = self.options.get("broker_host")
        topic = self.options.get("topic", "meteria/readings")
        if not broker_host:
            self.logger.info(
                "mqtt broker_host not configured; adapter running in idle mode",
                extra={"adapter": self.name},
            )
            return

        try:
            import paho.mqtt.client as mqtt  # type: ignore
        except Exception:
            self.logger.warning(
                "paho-mqtt not installed; mqtt adapter disabled",
                extra={"adapter": self.name},
            )
            return

        def on_connect(client, _userdata, _flags, reason_code, _properties=None):
            if reason_code == 0:
                client.subscribe(topic)
                self.logger.info(
                    "mqtt connected",
                    extra={"adapter": self.name, "topic": topic, "broker_host": broker_host},
                )
            else:
                self.logger.error(
                    "mqtt connect failed",
                    extra={"adapter": self.name, "reason_code": reason_code},
                )

        def on_message(_client, _userdata, msg):
            try:
                payload = json.loads(msg.payload.decode("utf-8"))
                timestamp_raw = payload.get("timestamp")
                if timestamp_raw:
                    timestamp = datetime.fromisoformat(timestamp_raw.replace("Z", "+00:00"))
                else:
                    timestamp = datetime.now(timezone.utc)

                reading = NormalizedReading.from_parts(
                    meter_external_id=str(payload["meter_external_id"]),
                    timestamp=timestamp,
                    value=float(payload["value"]),
                    unit=str(payload.get("unit", "kWh")),
                    quality_flag=str(payload.get("quality_flag", "ok")),
                    source="mqtt",
                )
                self._queue.put(reading)
            except Exception as exc:
                self.logger.error(
                    "mqtt payload normalization failed",
                    extra={"adapter": self.name, "error": str(exc)},
                )

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.on_connect = on_connect
        client.on_message = on_message

        if self.options.get("username"):
            client.username_pw_set(self.options.get("username"), self.options.get("password"))

        client.connect(
            host=broker_host,
            port=int(self.options.get("broker_port", 1883)),
            keepalive=int(self.options.get("keepalive_seconds", 30)),
        )
        client.loop_start()
        self._client = client

    def stop(self) -> None:
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None
        super().stop()

    def fetch(self) -> List[NormalizedReading]:
        readings: List[NormalizedReading] = []
        max_batch = int(self.options.get("max_drain_batch", 500))

        while len(readings) < max_batch:
            try:
                readings.append(self._queue.get_nowait())
            except queue.Empty:
                break

        return readings
