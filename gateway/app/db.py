from __future__ import annotations

import hashlib
import sqlite3
import threading
import time
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from .models import NormalizedReading, QueuedReading


class GatewayDatabase:
    def __init__(self, sqlite_path: str) -> None:
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(sqlite_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS buffered_readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reading_hash TEXT NOT NULL UNIQUE,
                    meter_external_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    quality_flag TEXT NOT NULL,
                    source TEXT NOT NULL,
                    adapter TEXT NOT NULL,
                    sent INTEGER NOT NULL DEFAULT 0,
                    failed INTEGER NOT NULL DEFAULT 0,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    next_retry_at INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT,
                    created_at INTEGER NOT NULL,
                    sent_at INTEGER
                );

                CREATE INDEX IF NOT EXISTS idx_buffered_pending
                ON buffered_readings (sent, failed, next_retry_at, id);
                """
            )
            self._conn.commit()

    @staticmethod
    def _hash_reading(reading: NormalizedReading) -> str:
        key = (
            f"{reading.meter_external_id}|{reading.timestamp}|{reading.value}|"
            f"{reading.unit}|{reading.quality_flag}|{reading.source}"
        )
        return hashlib.sha1(key.encode("utf-8")).hexdigest()

    def insert_readings(self, adapter_name: str, readings: Sequence[NormalizedReading]) -> int:
        if not readings:
            return 0

        now = int(time.time())
        rows = [
            (
                self._hash_reading(reading),
                reading.meter_external_id,
                reading.timestamp,
                reading.value,
                reading.unit,
                reading.quality_flag,
                reading.source,
                adapter_name,
                now,
            )
            for reading in readings
        ]

        with self._lock:
            cursor = self._conn.executemany(
                """
                INSERT OR IGNORE INTO buffered_readings (
                    reading_hash,
                    meter_external_id,
                    timestamp,
                    value,
                    unit,
                    quality_flag,
                    source,
                    adapter,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            self._conn.commit()
            return cursor.rowcount if cursor.rowcount != -1 else 0

    def fetch_ready_batch(self, limit: int) -> List[QueuedReading]:
        now = int(time.time())
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT
                    id,
                    meter_external_id,
                    timestamp,
                    value,
                    unit,
                    quality_flag,
                    source,
                    retry_count,
                    next_retry_at
                FROM buffered_readings
                WHERE sent = 0 AND failed = 0 AND next_retry_at <= ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (now, limit),
            ).fetchall()

        batch: List[QueuedReading] = []
        for row in rows:
            reading = NormalizedReading(
                meter_external_id=row["meter_external_id"],
                timestamp=row["timestamp"],
                value=float(row["value"]),
                unit=row["unit"],
                quality_flag=row["quality_flag"],
                source=row["source"],
            )
            batch.append(
                QueuedReading(
                    id=int(row["id"]),
                    reading=reading,
                    retry_count=int(row["retry_count"]),
                    next_retry_at=int(row["next_retry_at"]),
                )
            )
        return batch

    def mark_sent(self, ids: Iterable[int]) -> None:
        ids_list = list(ids)
        if not ids_list:
            return

        now = int(time.time())
        placeholders = ",".join("?" for _ in ids_list)
        with self._lock:
            self._conn.execute(
                f"""
                UPDATE buffered_readings
                SET sent = 1,
                    sent_at = ?,
                    last_error = NULL
                WHERE id IN ({placeholders})
                """,
                (now, *ids_list),
            )
            self._conn.commit()

    def schedule_retry(self, ids: Iterable[int], error_message: str, backoff_seconds: int) -> None:
        ids_list = list(ids)
        if not ids_list:
            return

        next_retry_at = int(time.time()) + max(1, backoff_seconds)
        placeholders = ",".join("?" for _ in ids_list)

        with self._lock:
            self._conn.execute(
                f"""
                UPDATE buffered_readings
                SET retry_count = retry_count + 1,
                    next_retry_at = ?,
                    last_error = ?
                WHERE id IN ({placeholders})
                """,
                (next_retry_at, error_message[:1000], *ids_list),
            )
            self._conn.commit()

    def mark_failed(self, ids: Iterable[int], error_message: str) -> None:
        ids_list = list(ids)
        if not ids_list:
            return

        placeholders = ",".join("?" for _ in ids_list)
        with self._lock:
            self._conn.execute(
                f"""
                UPDATE buffered_readings
                SET failed = 1,
                    last_error = ?
                WHERE id IN ({placeholders})
                """,
                (error_message[:1000], *ids_list),
            )
            self._conn.commit()

    def counts(self) -> Dict[str, int]:
        with self._lock:
            pending = self._conn.execute(
                "SELECT COUNT(*) FROM buffered_readings WHERE sent = 0 AND failed = 0"
            ).fetchone()[0]
            sent = self._conn.execute(
                "SELECT COUNT(*) FROM buffered_readings WHERE sent = 1"
            ).fetchone()[0]
            failed = self._conn.execute(
                "SELECT COUNT(*) FROM buffered_readings WHERE failed = 1"
            ).fetchone()[0]

        return {
            "pending": int(pending),
            "sent": int(sent),
            "failed": int(failed),
        }

    def close(self) -> None:
        with self._lock:
            self._conn.close()
