"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    const tenantSlug = String(form.get("tenant_slug") || "");

    try {
      const response = await fetch("http://162.55.94.126:4000/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          tenant_slug: tenantSlug || undefined
        })
      });

      const body = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !body.token) {
        throw new Error(body.error || "Login failed");
      }

      setToken(body.token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown login error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="panel" style={{ width: "100%", maxWidth: 420 }} onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 4 }}>Sign in to Meteria</h2>
        <p className="muted">Use the seeded demo credentials from `.env.example`.</p>

        <div style={{ marginBottom: 10 }}>
          <label htmlFor="tenant_slug">Tenant slug (optional)</label>
          <input className="input" id="tenant_slug" name="tenant_slug" placeholder="demo-tenant" />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required defaultValue="admin@demo.meteria.local" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required defaultValue="ChangeMe123!" />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </form>
    </div>
  );
}
