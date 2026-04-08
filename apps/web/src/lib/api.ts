export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";

// ==============================
// Token Handling
// ==============================

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

// ==============================
// API Fetch Wrapper
// ==============================

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = getToken();

  const headers = new Headers(init?.headers || {});
  headers.set("content-type", "application/json");

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store"
  });

  // Debug optional (kannst du später entfernen)
  // console.log("API CALL:", url, response.status);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { error?: string; message?: string };
      if (body.error || body.message) {
        message = body.error || body.message!;
      }
    } catch {
      // Falls keine JSON-Response → ignorieren
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
