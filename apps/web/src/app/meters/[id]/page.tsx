"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SimpleLineChart from "@/components/SimpleLineChart";
import StatCard from "@/components/StatCard";
import { apiFetch } from "@/lib/api";

interface MeterDetail {
  id: string;
  name: string;
  externalId: string;
  type: string;
  unit: string;
  readingMode: string;
  multiplier: number;
  readings: Array<{ id: string; timestamp: string; value: number; qualityFlag: string; source: string }>;
}

interface MeterTimeseries {
  meter: MeterDetail;
  points: Array<{ timestamp: string; value: number; quality_flag: string; source: string }>;
}

export default function MeterDetailPage() {
  const params = useParams<{ id: string }>();
  const meterId = params.id;

  const [meter, setMeter] = useState<MeterDetail | null>(null);
  const [timeseries, setTimeseries] = useState<MeterTimeseries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<string | null>(null);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 14);
    return { from, to };
  }, []);

  const load = async () => {
    try {
      const [meterResult, seriesResult] = await Promise.all([
        apiFetch<{ data: MeterDetail }>(`/api/v1/meters/${meterId}`),
        apiFetch<{ data: MeterTimeseries }>(
          `/api/v1/dashboard/meters/${meterId}/timeseries?from=${range.from.toISOString()}&to=${range.to.toISOString()}`
        )
      ]);

      setMeter(meterResult.data);
      setTimeseries(seriesResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meter detail");
    }
  };

  useEffect(() => {
    if (meterId) {
      load();
    }
  }, [meterId, range]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{meter?.name || "Meter detail"}</h2>
          <p className="muted">Timeseries quality and latest readings</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {!meter || !timeseries ? (
        <div className="panel">Loading meter...</div>
      ) : (
        <>
          <section className="grid stats">
            <StatCard label="External ID" value={meter.externalId} />
            <StatCard label="Type" value={meter.type} />
            <StatCard label="Reading mode" value={meter.readingMode} />
            <StatCard label="Unit" value={meter.unit} />
          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <h3>Timeseries (last 14 days)</h3>
            <SimpleLineChart data={timeseries.points} xKey="timestamp" yKey="value" stroke="#00796b" />
          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <h3>Manual reading entry</h3>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!meter) {
                  return;
                }

                const form = new FormData(event.currentTarget);
                try {
                  await apiFetch("/api/v1/readings/manual", {
                    method: "POST",
                    body: JSON.stringify({
                      meter_id: meter.id,
                      timestamp: String(form.get("timestamp") || ""),
                      value: Number(form.get("value") || "0"),
                      unit: meter.unit,
                      quality_flag: String(form.get("quality_flag") || "ok")
                    })
                  });
                  setManualStatus("Manual reading saved.");
                  event.currentTarget.reset();
                  await load();
                } catch (err) {
                  setManualStatus(err instanceof Error ? err.message : "Failed to save manual reading");
                }
              }}
            >
              <div className="form-row">
                <input className="input" name="timestamp" type="datetime-local" required />
                <input className="input" name="value" type="number" step="0.001" placeholder="Value" required />
              </div>
              <div className="form-row">
                <select name="quality_flag" defaultValue="ok">
                  <option value="ok">ok</option>
                  <option value="estimated">estimated</option>
                  <option value="suspect">suspect</option>
                  <option value="missing">missing</option>
                </select>
                <button type="submit">Save manual reading</button>
              </div>
            </form>
            {manualStatus ? <p className="muted">{manualStatus}</p> : null}
          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <h3>Latest readings</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Value</th>
                    <th>Quality</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {meter.readings.map((reading) => (
                    <tr key={reading.id}>
                      <td>{new Date(reading.timestamp).toLocaleString()}</td>
                      <td>{Number(reading.value).toFixed(3)}</td>
                      <td>
                        <span className={`tag ${reading.qualityFlag === "ok" ? "ok" : "warn"}`}>{reading.qualityFlag}</span>
                      </td>
                      <td>{reading.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
