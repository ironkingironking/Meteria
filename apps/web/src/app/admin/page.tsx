"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface User {
  id: string;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
}

interface Gateway {
  id: string;
  name: string;
  serialNumber: string;
  status: string;
  lastSeenAt: string | null;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [lastCreatedApiKey, setLastCreatedApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [tenantResult, userResult, gatewayResult, keyResult] = await Promise.all([
        apiFetch<{ data: Tenant[] }>("/api/v1/admin/tenants"),
        apiFetch<{ data: User[] }>("/api/v1/admin/users"),
        apiFetch<{ data: Gateway[] }>("/api/v1/admin/gateways"),
        apiFetch<{ data: ApiKeyRecord[] }>("/api/v1/admin/api-keys")
      ]);

      setTenants(tenantResult.data);
      setUsers(userResult.data);
      setGateways(gatewayResult.data);
      setApiKeys(keyResult.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await apiFetch("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: String(form.get("email") || ""),
          password: String(form.get("password") || ""),
          role: String(form.get("role") || "viewer"),
          first_name: String(form.get("first_name") || ""),
          last_name: String(form.get("last_name") || "")
        })
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  const onCreateApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      const result = await apiFetch<{ api_key: string }>("/api/v1/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") || "")
        })
      });
      setLastCreatedApiKey(result.api_key);
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Admin</h2>
          <p className="muted">Tenant users, gateways, and API keys</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="grid two" style={{ marginBottom: 14 }}>
        <div className="panel">
          <h3>Create user</h3>
          <form onSubmit={onCreateUser}>
            <div className="form-row">
              <input className="input" name="email" type="email" placeholder="user@example.com" required />
              <input className="input" name="password" type="password" placeholder="Password" required />
            </div>
            <div className="form-row">
              <input className="input" name="first_name" placeholder="First name" required />
              <input className="input" name="last_name" placeholder="Last name" required />
            </div>
            <div className="form-row">
              <select name="role" defaultValue="viewer">
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="viewer">viewer</option>
              </select>
              <button type="submit">Create user</button>
            </div>
          </form>
        </div>

        <div className="panel">
          <h3>Create API key</h3>
          <form onSubmit={onCreateApiKey}>
            <div className="form-row">
              <input className="input" name="name" placeholder="Gateway import key" required />
              <button type="submit">Generate key</button>
            </div>
          </form>

          {lastCreatedApiKey ? (
            <div className="panel" style={{ marginTop: 10, background: "#fff7e8" }}>
              <strong>New API key (shown once)</strong>
              <p style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{lastCreatedApiKey}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid two" style={{ marginBottom: 14 }}>
        <div className="panel">
          <h3>Tenant</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>{tenant.name}</td>
                    <td>{tenant.slug}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>API keys</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>{key.key_prefix}</td>
                    <td>{key.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h3>Users</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>
                      {user.first_name} {user.last_name}
                    </td>
                    <td>{user.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>Gateways</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Serial</th>
                  <th>Status</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {gateways.map((gateway) => (
                  <tr key={gateway.id}>
                    <td>{gateway.name}</td>
                    <td>{gateway.serialNumber}</td>
                    <td>{gateway.status}</td>
                    <td>{gateway.lastSeenAt ? new Date(gateway.lastSeenAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
