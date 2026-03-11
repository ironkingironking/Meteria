"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Building {
  id: string;
  name: string;
  city: string;
  postalCode: string;
  country: string;
  timezone: string;
}

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await apiFetch<{ data: Building[] }>("/api/v1/buildings");
      setBuildings(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load buildings");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch<{ data: Building }>("/api/v1/buildings", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") || ""),
          external_reference: String(form.get("external_reference") || "") || undefined,
          address_line_1: String(form.get("address_line_1") || ""),
          postal_code: String(form.get("postal_code") || ""),
          city: String(form.get("city") || ""),
          country: String(form.get("country") || "CH"),
          timezone: String(form.get("timezone") || "Europe/Zurich")
        })
      });
      event.currentTarget.reset();
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create building");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Buildings</h2>
          <p className="muted">Manage sites and inspect building-level consumption</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Create building</h3>
        <form onSubmit={onCreate}>
          <div className="form-row">
            <input className="input" name="name" placeholder="Name" required />
            <input className="input" name="external_reference" placeholder="External reference" />
          </div>
          <div className="form-row">
            <input className="input" name="address_line_1" placeholder="Address line" required />
            <input className="input" name="postal_code" placeholder="Postal code" required />
          </div>
          <div className="form-row">
            <input className="input" name="city" placeholder="City" required />
            <input className="input" name="country" placeholder="Country" defaultValue="CH" required />
          </div>
          <div className="form-row">
            <input className="input" name="timezone" placeholder="Timezone" defaultValue="Europe/Zurich" required />
            <button type="submit">Create building</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h3>Building list</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>City</th>
                <th>Timezone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((building) => (
                <tr key={building.id}>
                  <td>{building.name}</td>
                  <td>
                    {building.postalCode} {building.city}, {building.country}
                  </td>
                  <td>{building.timezone}</td>
                  <td>
                    <Link className="btn" href={`/buildings/${building.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {buildings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No buildings yet.
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
