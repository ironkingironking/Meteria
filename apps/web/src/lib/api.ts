export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const getToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("meteria_token");
};

export const setToken = (token: string): void => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("meteria_token", token);
  }
};

export const clearToken = (): void => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("meteria_token");
  }
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers || {});
  headers.set("content-type", "application/json");

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignored
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
