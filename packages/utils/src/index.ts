export const nowUtcIso = (): string => new Date().toISOString();

export const safeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

export const chunk = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) {
    return [items];
  }

  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
};

export const toCsv = (rows: Array<Record<string, unknown>>): string => {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }

    const raw = String(value);
    if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }

    return raw;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }

  return lines.join("\n");
};
