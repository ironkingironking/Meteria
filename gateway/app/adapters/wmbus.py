from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Dict, List

from .base import Adapter
from ..models import NormalizedReading


class WirelessMBusAdapter(Adapter):
    """
    Placeholder adapter for Wireless M-Bus receivers.

    Extension path:
    - replace synthetic meter loop with decoded telegram input
    - map telegram fields to meter_external_id/unit/value
    - preserve normalization via NormalizedReading
    """

    def __init__(self, options: Dict, logger) -> None:
        super().__init__("wmbus", options, logger)
        self._meters = options.get("meters", [])
        self._state: Dict[str, float] = {
            meter.get("meter_external_id", f"wmbus-{i}"): float(meter.get("start_value", 0.0))
            for i, meter in enumerate(self._meters)
        }
        self._last_emit_ts = 0.0

    def fetch(self) -> List[NormalizedReading]:
        if not self._meters:
            return []

        now = time.time()
        emit_interval = float(self.options.get("emit_interval_seconds", 15))
        if now - self._last_emit_ts < emit_interval:
            return []

        self._last_emit_ts = now
        timestamp = datetime.now(timezone.utc)
        readings: List[NormalizedReading] = []

        for meter in self._meters:
            meter_external_id = meter["meter_external_id"]
            step = float(meter.get("step", 1.0))
            unit = meter.get("unit", "kWh")
            quality_flag = meter.get("quality_flag", "ok")

            self._state[meter_external_id] += step
            readings.append(
                NormalizedReading.from_parts(
                    meter_external_id=meter_external_id,
                    timestamp=timestamp,
                    value=self._state[meter_external_id],
                    unit=unit,
                    quality_flag=quality_flag,
                    source="wmbus",
                )
            )

        return readings
