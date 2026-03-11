"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SimpleLineChart from "@/components/SimpleLineChart";
import StatCard from "@/components/StatCard";
import { apiFetch, API_BASE_URL, getToken } from "@/lib/api";

interface BuildingDetail {
  id: string;
  name: string;
  meters: Array<{ id: string; name: string; externalId: string; type: string; unit: string }>;
  units: Array<{ id: string; name: string; unitNumber: string }>;
}

interface ConsumptionData {
  total_consumption: number;
  meters: Array<{ meter_id: string; meter_name: string; consumption: number; unit: string }>;
  monthly_chart: Array<{ month: string; value: number }>;
}

export default function BuildingDetailPage() {
  const params = useParams<{ id: string }>();
  const buildingId = params.id;

  const [building, setBuilding] = useState<BuildingDetail | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    return { from, to };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [buildingResult, consumptionResult] = await Promise.all([
          apiFetch<{ data: BuildingDetail }>(`/api/v1/buildings/${buildingId}`),
          apiFetch<{ data: ConsumptionData }>(
            `/api/v1/dashboard/buildings/${buildingId}/consumption?from=${dateRange.from.toISOString()}&to=${dateRange.to.toISOString()}`
          )
        ]);

        setBuilding(buildingResult.data);
        setConsumption(consumptionResult.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load building details");
      }
    };

    if (buildingId) {
      load();
    }
  }, [buildingId, dateRange]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{building?.name || "Building"}</h2>
          <p className="muted">Consumption analytics and meter-level details</p>
        </div>
        {building ? (
          <a
            className="btn"
            href={`${API_BASE_URL}/api/v1/exports/readings.csv?meter_id=${building.meters[0]?.id || ""}&from=${dateRange.from.toISOString()}&to=${dateRange.to.toISOString()}`}
            onClick={(event) => {
              const token = getToken();
              if (!token) {
                event.preventDefault();
                return;
              }
              // Cannot attach authorization headers on direct link in browser; use token in a quick query fallback.
              // For production, this should be proxied through the web app.
            }}
          >
            Export CSV (first meter)
          </a>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {!building || !consumption ? (
        <div className="panel">Loading building details...</div>
      ) : (
        <>
          <section className="grid stats">
            <StatCard label="Units" value={building.units.length} />
            <StatCard label="Meters" value={building.meters.length} />
            <StatCard label="Consumption (6m)" value={consumption.total_consumption.toFixed(2)} />
            <StatCard label="Chart points" value={consumption.monthly_chart.length} />
          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <h3>Monthly consumption</h3>
            <SimpleLineChart data={consumption.monthly_chart} xKey="month" yKey="value" />
          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <h3>Meters</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Meter</th>
                    <th>Type</th>
                    <th>External ID</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {building.meters.map((meter) => (
                    <tr key={meter.id}>
                      <td>{meter.name}</td>
                      <td>{meter.type}</td>
                      <td>{meter.externalId}</td>
                      <td>{meter.unit}</td>
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
