import { v4 as uuidv4 } from 'uuid';

/** Generates a new row id (UUID v4) — matches the cloud's UUIDField primary keys. */
export function newId(): string {
  return uuidv4();
}

/** ISO-8601 UTC timestamp with millisecond precision, matching the SQL default expression. */
export function nowIso(): string {
  return new Date().toISOString();
}
