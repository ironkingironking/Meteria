from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone

from app.db import GatewayDatabase
from app.models import NormalizedReading


class GatewayDatabaseTests(unittest.TestCase):
    def test_insert_fetch_and_mark_sent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            db = GatewayDatabase(f"{tmp_dir}/gateway.db")

            reading = NormalizedReading.from_parts(
                meter_external_id="meter-a",
                timestamp=datetime.now(timezone.utc),
                value=12.3,
                unit="kWh",
                quality_flag="ok",
                source="test",
            )

            inserted = db.insert_readings("test_adapter", [reading])
            self.assertEqual(inserted, 1)

            batch = db.fetch_ready_batch(limit=100)
            self.assertEqual(len(batch), 1)
            self.assertEqual(batch[0].reading.meter_external_id, "meter-a")

            db.mark_sent([batch[0].id])
            after = db.fetch_ready_batch(limit=100)
            self.assertEqual(len(after), 0)

            counts = db.counts()
            self.assertEqual(counts["sent"], 1)
            db.close()


if __name__ == "__main__":
    unittest.main()
