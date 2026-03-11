"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Meter {
  id: string;
  name: string;
  externalId: string;
  type: string;
  readingMode: string;
  unit: string;
  building: { id: string; name: string };
}

interface Building {
  id: string;
  name: string;
}

export default function MetersPage() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const load = async () => {
    try {
      const [metersResult, buildingResult] = await Promise.all([
        apiFetch<{ data: Meter[] }>("/api/v1/meters"),
        apiFetch<{ data: Building[] }>("/api/v1/buildings")
      ]);
      setMeters(metersResult.data);
      setBuildings(buildingResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meters");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/v1/meters", {
        method: "POST",
        body: JSON.stringify({
          building_id: String(form.get("building_id") || ""),
          unit_id: null,
          meter_number: String(form.get("meter_number") || ""),
          external_id: String(form.get("external_id") || ""),
          name: String(form.get("name") || ""),
          type: String(form.get("type") || "heat"),
          medium: String(form.get("medium") || "heat"),
          unit: String(form.get("unit") || "kWh"),
          direction: String(form.get("direction") || "consumption"),
          reading_mode: String(form.get("reading_mode") || "cumulative"),
          multiplier: Number(form.get("multiplier") || "1"),
          installed_at: String(form.get("installed_at") || new Date().toISOString())
        })
      });
      event.currentTarget.reset();
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create meter");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Meters</h2>
          <p className="muted">Register and inspect all tenant meters</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Create meter</h3>
        <form onSubmit={onCreate}>
          <div className="form-row">
            <select name="building_id" required>
              <option value="">Select building</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.name}
                </option>
              ))}
            </select>
            <input className="input" name="name" placeholder="Meter name" required />
          </div>
          <div className="form-row">
            <input className="input" name="meter_number" placeholder="Meter number" required />
            <input className="input" name="external_id" placeholder="External ID" required />
          </div>
          <div className="form-row">
            <select name="type" defaultValue="heat">
              <option value="electricity">electricity</option>
              <option value="water_cold">water_cold</option>
              <option value="water_hot">water_hot</option>
              <option value="heat">heat</option>
              <option value="gas">gas</option>
            </select>
            <select name="reading_mode" defaultValue="cumulative">
              <option value="cumulative">cumulative</option>
              <option value="interval">interval</option>
            </select>
          </div>
          <div className="form-row">
            <input className="input" name="medium" placeholder="Medium" defaultValue="heat" />
            <input className="input" name="unit" placeholder="Unit" defaultValue="kWh" />
          </div>
          <div className="form-row">
            <input className="input" name="multiplier" placeholder="Multiplier" defaultValue="1" />
            <input className="input" name="installed_at" type="datetime-local" required />
          </div>
          <button type="submit">Create meter</button>
        </form>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>CSV import (historical readings)</h3>
        <p className="muted">
          Columns: <code>meter_external_id,timestamp,value,unit,quality_flag,raw_value</code>
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const csvContent = String(form.get("csv_content") || "");

            try {
              await apiFetch("/api/v1/readings/import-csv", {
                method: "POST",
                body: JSON.stringify({
                  csv_content: csvContent
                })
              });
              setImportStatus("CSV imported successfully.");
              event.currentTarget.reset();
              await load();
            } catch (err) {
              setImportStatus(err instanceof Error ? err.message : "CSV import failed");
            }
          }}
        >
          <textarea
            className="input"
            name="csv_content"
            rows={6}
            placeholder={"meter_external_id,timestamp,value,unit,quality_flag\\nheat-main-001,2026-03-11T12:00:00Z,14234.45,kWh,ok"}
            required
          />
          <div style={{ marginTop: 10 }}>
            <button type="submit">Import CSV</button>
          </div>
        </form>
        {importStatus ? <p className="muted">{importStatus}</p> : null}
      </section>

      <section className="panel">
        <h3>Meter inventory</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>External ID</th>
                <th>Type</th>
                <th>Mode</th>
                <th>Building</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {meters.map((meter) => (
                <tr key={meter.id}>
                  <td>{meter.name}</td>
                  <td>{meter.externalId}</td>
                  <td>{meter.type}</td>
                  <td>{meter.readingMode}</td>
                  <td>{meter.building?.name}</td>
                  <td>
                    <Link className="btn" href={`/meters/${meter.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {meters.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No meters found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
