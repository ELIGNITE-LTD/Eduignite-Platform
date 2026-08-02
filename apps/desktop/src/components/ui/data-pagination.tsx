"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Shared client-side pagination used by every table/grid that lists users
 * (students, staff, parents, ...). Default page size is 20 records per page.
 */
export function usePagination<T>(items: T[] | undefined | null, pageSize = 20) {
  const [page, setPage] = useState(1);
  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Keep the current page in range when the underlying list shrinks/filters.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(
    () => (items || []).slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, totalPages, total, pageItems, pageSize };
}

export interface DataPaginationProps {
  pager: {
    page: number;
    setPage: (page: number) => void;
    totalPages: number;
    total: number;
    pageSize: number;
  };
  label?: string;
  className?: string;
}

export function DataPagination({ pager, label = "items", className }: DataPaginationProps) {
  const { page, setPage, totalPages, total, pageSize } = pager;
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-4 ${className || ""}`}>
      <p className="text-xs text-muted-foreground">
        Showing {from}–{to} of {total} {label}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          disabled={page <= 1}
          onClick={() => setPage(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-bold text-primary">
          Page {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg"
          disabled={page >= totalPages}
          onClick={() => setPage(Math.min(totalPages, page + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default DataPagination;
