from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Iterable, List

from .adapters.base import Adapter
from .config import SchedulerConfig
from .db import GatewayDatabase
from .sender import MeteriaSender


@dataclass
class RuntimeStats:
    last_poll_ts: int = 0
    last_upload_ts: int = 0
    uploaded_in_last_cycle: int = 0


class GatewayScheduler:
    def __init__(
        self,
        adapters: Iterable[Adapter],
        db: GatewayDatabase,
        sender: MeteriaSender,
        config: SchedulerConfig,
        logger,
    ) -> None:
        self.adapters = list(adapters)
        self.db = db
        self.sender = sender
        self.config = config
        self.logger = logger
        self._stats = RuntimeStats()
        self._stop_event = threading.Event()
        self._status_server: ThreadingHTTPServer | None = None
        self._status_thread: threading.Thread | None = None

    def _build_status_payload(self) -> Dict[str, int | str]:
        counts = self.db.counts()
        return {
            "status": "ok",
            "pending": counts["pending"],
            "sent": counts["sent"],
            "failed": counts["failed"],
            "last_poll_ts": self._stats.last_poll_ts,
            "last_upload_ts": self._stats.last_upload_ts,
            "uploaded_in_last_cycle": self._stats.uploaded_in_last_cycle,
        }

    def _start_status_server(self) -> None:
        payload_fn = self._build_status_payload

        class StatusHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path not in ("/health", "/status"):
                    self.send_response(404)
                    self.end_headers()
                    return

                payload = payload_fn()
                encoded = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, format, *args):
                return

        self._status_server = ThreadingHTTPServer(
            (self.config.status_host, self.config.status_port), StatusHandler
        )
        self._status_thread = threading.Thread(
            target=self._status_server.serve_forever,
            name="status-server",
            daemon=True,
        )
        self._status_thread.start()
        self.logger.info(
            "status endpoint started",
            extra={"host": self.config.status_host, "port": self.config.status_port},
        )

    def _stop_status_server(self) -> None:
        if self._status_server is not None:
            self._status_server.shutdown()
            self._status_server.server_close()
            self._status_server = None

        if self._status_thread is not None:
            self._status_thread.join(timeout=1.0)
            self._status_thread = None

    def run_forever(self) -> None:
        for adapter in self.adapters:
            adapter.start()

        self._start_status_server()

        last_poll = 0.0
        last_upload = 0.0
        last_heartbeat = 0.0

        try:
            while not self._stop_event.is_set():
                now = time.time()

                if now - last_poll >= self.config.poll_interval_seconds:
                    self._poll_adapters()
                    last_poll = now
                    self._stats.last_poll_ts = int(now)

                if now - last_upload >= self.config.upload_interval_seconds:
                    upload_result = self.sender.upload_once()
                    self._stats.uploaded_in_last_cycle = upload_result.get("sent", 0)
                    self._stats.last_upload_ts = int(now)
                    last_upload = now

                if now - last_heartbeat >= self.config.heartbeat_interval_seconds:
                    counts = self.db.counts()
                    self.logger.info(
                        "heartbeat",
                        extra={
                            "pending": counts["pending"],
                            "sent": counts["sent"],
                            "failed": counts["failed"],
                        },
                    )
                    last_heartbeat = now

                time.sleep(0.5)
        finally:
            self._stop_status_server()
            for adapter in self.adapters:
                adapter.stop()

    def stop(self) -> None:
        self._stop_event.set()

    def _poll_adapters(self) -> None:
        for adapter in self.adapters:
            try:
                readings = adapter.fetch()
                inserted = self.db.insert_readings(adapter.name, readings)
                if inserted > 0:
                    self.logger.info(
                        "adapter readings buffered",
                        extra={"adapter": adapter.name, "inserted": inserted},
                    )
            except Exception as exc:
                self.logger.exception(
                    "adapter polling failed",
                    extra={"adapter": adapter.name, "error": str(exc)},
                )
