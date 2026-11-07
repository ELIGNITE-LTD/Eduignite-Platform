/**
 * Fetch every page of a paginated list endpoint.
 *
 * The API paginates by default (20 rows, ceiling `max_page_size`). A selector
 * or a table that needs the whole set must follow `next` until the server says
 * there is no more - asking for `page_size: 500` or `limit: 5000` once is not
 * enough, because the server clamps it and the rest silently disappears.
 *
 * Rules:
 *  - An endpoint that is not paginated (plain array) is returned as-is.
 *  - Pages are followed by `next`, not by assumed size, so a server that clamps
 *    the page size still yields the full list.
 *  - A failed page rejects the whole call. Callers must never show a partial
 *    list as if it were complete.
 *  - Rows are de-duplicated by `id` (a row can shift between pages if records
 *    are created while paging).
 */
export interface PageLike<T> {
  count?: number;
  next?: string | null;
  results?: T[];
}

export type PageFetcher<T> = (
  page: number,
  pageSize: number,
) => Promise<PageLike<T> | T[] | null | undefined>;

export interface FetchAllOptions {
  /** Rows requested per page. The server may return fewer (it clamps). */
  pageSize?: number;
  /** Safety valve against a server that never stops saying `next`. */
  maxPages?: number;
}

export const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_PAGES = 200;

export async function fetchAllPages<T>(
  fetchPage: PageFetcher<T>,
  options: FetchAllOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const rows: T[] = [];
  const seen = new Set<string>();

  const push = (items: T[]) => {
    for (const item of items) {
      const id = (item as { id?: unknown } | null)?.id;
      if (id === undefined || id === null) {
        rows.push(item);
        continue;
      }
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(item);
    }
  };

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage(page, pageSize);
    if (Array.isArray(response)) return response; // endpoint is not paginated
    const results = response?.results ?? [];
    push(results);
    if (!response?.next || results.length === 0) break;
  }
  return rows;
}
