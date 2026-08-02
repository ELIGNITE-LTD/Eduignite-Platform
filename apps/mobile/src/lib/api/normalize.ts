import type { PaginatedResponse } from "./types";

export function normalizePaginatedResponse<T>(
  data: PaginatedResponse<T> | T[] | null | undefined
): PaginatedResponse<T> {
  if (Array.isArray(data)) {
    return {
      count: data.length,
      next: null,
      previous: null,
      results: data,
    };
  }

  return data ?? {
    count: 0,
    next: null,
    previous: null,
    results: [],
  };
}
