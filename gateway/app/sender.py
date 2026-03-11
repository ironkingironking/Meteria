from __future__ import annotations

import random
from typing import Dict, List, Sequence

import requests

from .config import MeteriaApiConfig
from .db import GatewayDatabase
from .models import QueuedReading


class MeteriaSender:
    def __init__(self, db: GatewayDatabase, config: MeteriaApiConfig, logger) -> None:
        self.db = db
        self.config = config
        self.logger = logger

    def _backoff_seconds(self, retry_count: int) -> int:
        base = self.config.retry_base_seconds
        backoff = min(base * (2 ** min(retry_count, 12)), self.config.max_backoff_seconds)
        jitter = random.randint(0, max(1, backoff // 5))
        return min(backoff + jitter, self.config.max_backoff_seconds)

    @staticmethod
    def _is_permanent_error(message: str) -> bool:
        text = message.lower()
        return (
            "unknown meter_external_id" in text
            or "invalid" in text
            or "unauthorized" in text
            or "forbidden" in text
        )

    def upload_once(self) -> Dict[str, int]:
        batch = self.db.fetch_ready_batch(limit=self.config.batch_size)
        if not batch:
            return {"attempted": 0, "sent": 0, "failed": 0, "retried": 0}

        payload = {
            "gateway_serial": self.config.gateway_serial,
            "readings": [row.as_api_payload() for row in batch],
        }

        try:
            response = requests.post(
                f"{self.config.base_url.rstrip('/')}{self.config.ingestion_path}",
                json=payload,
                headers={
                    "x-gateway-token": self.config.gateway_token,
                    "content-type": "application/json",
                },
                timeout=self.config.timeout_seconds,
            )
        except requests.RequestException as exc:
            backoff = self._backoff_seconds(max(row.retry_count for row in batch))
            self.db.schedule_retry([row.id for row in batch], f"network_error: {exc}", backoff)
            self.logger.warning(
                "upload failed due to network",
                extra={
                    "error": str(exc),
                    "attempted": len(batch),
                    "retry_in_seconds": backoff,
                },
            )
            return {"attempted": len(batch), "sent": 0, "failed": 0, "retried": len(batch)}

        if response.status_code >= 500 or response.status_code in (408, 429):
            backoff = self._backoff_seconds(max(row.retry_count for row in batch))
            self.db.schedule_retry(
                [row.id for row in batch],
                f"server_error_{response.status_code}: {response.text[:200]}",
                backoff,
            )
            self.logger.warning(
                "upload deferred due to server-side failure",
                extra={
                    "status_code": response.status_code,
                    "attempted": len(batch),
                    "retry_in_seconds": backoff,
                },
            )
            return {"attempted": len(batch), "sent": 0, "failed": 0, "retried": len(batch)}

        if response.status_code >= 400:
            message = f"client_error_{response.status_code}: {response.text[:200]}"
            self.db.mark_failed([row.id for row in batch], message)
            self.logger.error(
                "upload permanently failed due to client-side error",
                extra={"status_code": response.status_code, "attempted": len(batch)},
            )
            return {"attempted": len(batch), "sent": 0, "failed": len(batch), "retried": 0}

        body = response.json()
        errors = body.get("errors", []) if isinstance(body, dict) else []
        error_indices = {int(item.get("index", -1)) for item in errors if isinstance(item, dict)}
        error_map = {
            int(item.get("index", -1)): str(item.get("message", "unknown error"))
            for item in errors
            if isinstance(item, dict)
        }

        sent_ids: List[int] = []
        retry_ids: List[int] = []
        failed_ids: List[int] = []

        for idx, row in enumerate(batch):
            if idx not in error_indices:
                sent_ids.append(row.id)
                continue

            message = error_map.get(idx, "upload error")
            if self._is_permanent_error(message) or row.retry_count >= self.config.max_retries:
                failed_ids.append(row.id)
            else:
                retry_ids.append(row.id)

        if sent_ids:
            self.db.mark_sent(sent_ids)

        if retry_ids:
            row_lookup = {row.id: row for row in batch}
            highest_retry = max(row_lookup[row_id].retry_count for row_id in retry_ids)
            backoff = self._backoff_seconds(highest_retry)
            self.db.schedule_retry(retry_ids, "partial_upload_retry", backoff)

        if failed_ids:
            self.db.mark_failed(failed_ids, "permanent_upload_error")

        self.logger.info(
            "upload completed",
            extra={
                "attempted": len(batch),
                "sent": len(sent_ids),
                "retried": len(retry_ids),
                "failed": len(failed_ids),
                "api_status": body.get("status") if isinstance(body, dict) else "unknown",
            },
        )

        return {
            "attempted": len(batch),
            "sent": len(sent_ids),
            "failed": len(failed_ids),
            "retried": len(retry_ids),
        }
