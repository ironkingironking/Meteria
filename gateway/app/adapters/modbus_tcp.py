from __future__ import annotations

import random
import time
from datetime import datetime, timezone
from typing import Dict, List

from .base import Adapter
from ..models import NormalizedReading


class ModbusTcpAdapter(Adapter):
    """
    Placeholder adapter for Modbus TCP polling.

    Extension path:
    - connect using pymodbus ModbusTcpClient
    - read configured register map per meter
    - apply scaling and convert to NormalizedReading
    """

    def __init__(self, options: Dict, logger) -> None:
        super().__init__("modbus_tcp", options, logger)
        self._meters = options.get("meters", [])
        self._last_poll_ts = 0.0

    def fetch(self) -> List[NormalizedReading]:
        if not self._meters:
            return []

        now = time.time()
        poll_every = float(self.options.get("poll_every_seconds", 20))
        if now - self._last_poll_ts < poll_every:
            return []

        self._last_poll_ts = now
        timestamp = datetime.now(timezone.utc)
        readings: List[NormalizedReading] = []

        for meter in self._meters:
            base = float(meter.get("base_value", 100.0))
            jitter = float(meter.get("jitter", 0.1))
            value = base + random.uniform(-jitter, jitter)

            readings.append(
                NormalizedReading.from_parts(
                    meter_external_id=meter["meter_external_id"],
                    timestamp=timestamp,
                    value=value,
                    unit=meter.get("unit", "kWh"),
                    quality_flag=meter.get("quality_flag", "ok"),
                    source="modbus_tcp",
                )
            )

        return readings
