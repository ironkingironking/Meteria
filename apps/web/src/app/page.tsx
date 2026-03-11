"use client";

import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import { apiFetch } from "@/lib/api";

interface OverviewData {
  total_buildings: number;
  total_meters: number;
  ingestion_last_24h: number;
  gateways_online: number;
  gateways_offline: number;
  recent_anomalies: Array<{ id: string; severity: string; message: string }>;
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: OverviewData }>("/api/v1/dashboard/overview")
      .then((result) => setData(result.data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Overview</h2>
          <p className="muted">Tenant-wide ingestion, assets, and gateway health</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {!data ? (
        <div className="panel">Loading overview...</div>
      ) : (
        <>
          <section className="grid stats">
            <StatCard label="Buildings" value={data.total_buildings} />
            <StatCard label="Meters" value={data.total_meters} />
            <StatCard label="Ingestion (24h)" value={data.ingestion_last_24h} />
            <StatCard
              label="Gateways"
              value={`${data.gateways_online}/${data.gateways_online + data.gateways_offline}`}
              hint="online/total"
            />
          </section>

          <section className="panel" style={{ marginTop: 14 }}>
            <h3>Recent anomalies (placeholder)</h3>
            <div className="grid" style={{ marginTop: 8 }}>
              {data.recent_anomalies.map((item) => (
                <div key={item.id} className="panel" style={{ borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{item.id}</strong>
                    <span className="tag warn">{item.severity}</span>
                  </div>
                  <p className="muted" style={{ marginBottom: 0 }}>
                    {item.message}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
