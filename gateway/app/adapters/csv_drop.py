from __future__ import annotations

import csv
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

from .base import Adapter
from ..models import NormalizedReading


class CsvDropAdapter(Adapter):
    """
    Reads CSV files from a drop folder and converts them to normalized readings.

    Extension path:
    - enforce tenant-specific file signing
    - support schema versions and custom column maps
    - add checksum/manifest handling for large imports
    """

    def __init__(self, options: Dict, logger) -> None:
        super().__init__("csv_drop", options, logger)
        self._watch_dir = Path(options.get("watch_dir", "/data/drop"))
        self._processed_dir = Path(options.get("processed_dir", "/data/processed"))

    def start(self) -> None:
        self._watch_dir.mkdir(parents=True, exist_ok=True)
        self._processed_dir.mkdir(parents=True, exist_ok=True)
        super().start()

    def fetch(self) -> List[NormalizedReading]:
        readings: List[NormalizedReading] = []
        files = sorted(self._watch_dir.glob("*.csv"))

        for file_path in files:
            file_readings = self._parse_file(file_path)
            readings.extend(file_readings)
            processed_name = f"{file_path.stem}.{int(datetime.now(timezone.utc).timestamp())}.processed.csv"
            shutil.move(str(file_path), str(self._processed_dir / processed_name))
            self.logger.info(
                "csv file processed",
                extra={"adapter": self.name, "file": str(file_path), "rows": len(file_readings)},
            )

        return readings

    def _parse_file(self, file_path: Path) -> List[NormalizedReading]:
        parsed: List[NormalizedReading] = []
        with file_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                timestamp_raw = row.get("timestamp")
                if timestamp_raw:
                    timestamp = datetime.fromisoformat(timestamp_raw.replace("Z", "+00:00"))
                else:
                    timestamp = datetime.now(timezone.utc)

                parsed.append(
                    NormalizedReading.from_parts(
                        meter_external_id=str(row["meter_external_id"]),
                        timestamp=timestamp,
                        value=float(row["value"]),
                        unit=str(row.get("unit", "kWh")),
                        quality_flag=str(row.get("quality_flag", "ok")),
                        source=str(row.get("source", "csv_drop")),
                    )
                )

        return parsed
