export function normalizeList<T>(payload: { results?: T[] } | T[] | null | undefined): T[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
}
