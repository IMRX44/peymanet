/**
 * JSON column helpers.
 *
 * JSON payloads are stored as String columns ("...Json" suffix) so the schema is
 * portable across SQLite (dev) and Postgres (prod). These helpers centralize the
 * (de)serialization and keep the rest of the app working with typed values.
 */

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
