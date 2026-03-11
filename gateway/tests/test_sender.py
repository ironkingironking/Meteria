from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from logging import getLogger
from unittest.mock import patch

from app.config import MeteriaApiConfig
from app.db import GatewayDatabase
from app.models import NormalizedReading
from app.sender import MeteriaSender


class DummyResponse:
    def __init__(self, status_code: int, body: dict) -> None:
        self.status_code = status_code
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


class MeteriaSenderTests(unittest.TestCase):
    def test_success_marks_rows_as_sent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            db = GatewayDatabase(f"{tmp_dir}/gateway.db")
            reading = NormalizedReading.from_parts(
                meter_external_id="heat-main-001",
                timestamp=datetime.now(timezone.utc),
                value=42.0,
                unit="kWh",
                quality_flag="ok",
                source="test",
            )
            db.insert_readings("unit_test", [reading])

            sender = MeteriaSender(
                db=db,
                config=MeteriaApiConfig(
                    base_url="http://localhost:4000",
                    gateway_serial="gw-1",
                    gateway_token="token",
                    batch_size=100,
                ),
                logger=getLogger("test"),
            )

            with patch("app.sender.requests.post", return_value=DummyResponse(200, {"status": "success"})):
                result = sender.upload_once()

            self.assertEqual(result["sent"], 1)
            self.assertEqual(db.counts()["sent"], 1)
            db.close()


if __name__ == "__main__":
    unittest.main()
