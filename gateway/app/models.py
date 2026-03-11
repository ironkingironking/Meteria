from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict


@dataclass(frozen=True)
class NormalizedReading:
    meter_external_id: str
    timestamp: str
    value: float
    unit: str
    quality_flag: str
    source: str

    def __post_init__(self) -> None:
        if not self.meter_external_id.strip():
            raise ValueError("meter_external_id cannot be empty")
        if not self.unit.strip():
            raise ValueError("unit cannot be empty")
        if self.quality_flag not in {"ok", "estimated", "suspect", "missing"}:
            raise ValueError("quality_flag must be one of: ok, estimated, suspect, missing")
        if not self.source.strip():
            raise ValueError("source cannot be empty")
        # Validate timestamp format.
        datetime.fromisoformat(self.timestamp.replace("Z", "+00:00"))

    @staticmethod
    def from_parts(
        meter_external_id: str,
        timestamp: datetime,
        value: float,
        unit: str,
        quality_flag: str,
        source: str,
    ) -> "NormalizedReading":
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)

        return NormalizedReading(
            meter_external_id=meter_external_id,
            timestamp=timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            value=float(value),
            unit=unit,
            quality_flag=quality_flag,
            source=source,
        )

    def as_api_payload(self) -> Dict[str, Any]:
        return {
            "meter_external_id": self.meter_external_id,
            "timestamp": self.timestamp,
            "value": self.value,
            "unit": self.unit,
            "quality_flag": self.quality_flag,
            "source": self.source,
        }


@dataclass
class QueuedReading:
    id: int
    reading: NormalizedReading
    retry_count: int
    next_retry_at: int

    def as_api_payload(self) -> Dict[str, Any]:
        return self.reading.as_api_payload()
