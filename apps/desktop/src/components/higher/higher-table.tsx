"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { downloadBlob } from "@/lib/browser-download";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { useHigherText } from "./higher-shared";

export interface HigherColumn<T> {
  key: string;
  header: string;
  /** Cell content on screen. Defaults to the sort value. */
  render?: (row: T) => ReactNode;
  /** Value used for sorting, searching and downloads. */
  value: (row: T) => string | number;
  align?: "left" | "right" | "center";
  mono?: boolean;
  sortable?: boolean;
  /** Left out of downloads (for example action buttons). */
  noExport?: boolean;
  className?: string;
}

export interface HigherExport {
  title: string;
  fileName: string;
  chips?: Array<{ label: string; value: string }>;
  landscape?: boolean;
  issuingOffice?: string;
  footnote?: string;
}

/** Excel-friendly CSV (UTF-8 with BOM, semicolon-free, quotes escaped). */
export function downloadCsv(fileName: string, header: string[], rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  downloadBlob(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }), fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
}

interface Props<T> {
  columns: HigherColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Filter controls (selects) shown beside the search box. */
  filters?: ReactNode;
  searchPlaceholder?: string;
  /** Hide the search box when the filters already do the job. */
  noSearch?: boolean;
  exportConfig?: HigherExport;
  pageSize?: number;
  empty: string;
  /** Shown on the right of each row's last cell area, e.g. actions. */
  rowClassName?: (row: T) => string | undefined;
  label?: string;
  footer?: ReactNode;
}

export function HigherTable<T>({ columns, rows, rowKey, filters, searchPlaceholder, noSearch, exportConfig, pageSize = 15, empty, rowClassName, label = "rows", footer }: Props<T>) {
  const tr = useHigherText();
  const { user } = useAuth();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = term ? rows.filter((r) => columns.some((c) => String(c.value(r)).toLowerCase().includes(term))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        list = [...list].sort((a, b) => {
          const x = col.value(a); const y = col.value(b);
          return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
        });
      }
    }
    return list;
  }, [rows, q, sort, columns]);

  const pager = usePagination(visible, pageSize);
  const exportable = columns.filter((c) => !c.noExport);

  async function pdf() {
    if (!exportConfig || visible.length === 0) return;
    try {
      await generateBrandedTablePdf({
      ministry: "higher",
        title: exportConfig.title,
        school: user?.school as never,
        schoolName: user?.school?.name || "EduIgnite",
        chips: [...(exportConfig.chips ?? []), { label: tr("Total", "Total"), value: String(visible.length) }],
        issuingOffice: exportConfig.issuingOffice,
        landscape: exportConfig.landscape ?? exportable.length > 6,
        footnote: exportConfig.footnote,
        columns: [tr("No", "N°"), ...exportable.map((c) => c.header)],
        rows: visible.map((r, i) => [i + 1, ...exportable.map((c) => c.value(r))]),
        monoColumns: exportable.map((c, i) => (c.mono ? i + 1 : -1)).filter((i) => i > 0),
        centerColumns: exportable.map((c, i) => (c.align === "center" ? i + 1 : -1)).filter((i) => i > 0),
        compact: visible.length > 25,
        fileName: exportConfig.fileName,
      });
    } catch {
      toast({ variant: "destructive", title: tr("The PDF could not be created", "Le PDF n'a pas pu être créé") });
    }
  }

  function csv() {
    if (!exportConfig || visible.length === 0) return;
    downloadCsv(exportConfig.fileName, exportable.map((c) => c.header), visible.map((r) => exportable.map((c) => c.value(r))));
  }

  const toggleSort = (key: string) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {noSearch ? null : (
          <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? tr("Search...", "Rechercher...")} aria-label={tr("Search", "Rechercher")} />
          </div>
        )}
        {filters}
        {exportConfig ? (
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={visible.length === 0} onClick={pdf}><FileText className="mr-1.5 h-4 w-4" />PDF</Button>
            <Button type="button" variant="outline" size="sm" disabled={visible.length === 0} onClick={csv}><FileSpreadsheet className="mr-1.5 h-4 w-4" />Excel</Button>
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    const Icon = !active ? ArrowUpDown : sort!.dir === 1 ? ArrowUp : ArrowDown;
                    return (
                      <TableHead key={c.key} className={`whitespace-nowrap text-[11px] font-bold uppercase tracking-wider ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>
                        {c.sortable === false || !c.header ? c.header : (
                          <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(c.key)}>
                            {c.header}<Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
                          </button>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((row) => (
                  <TableRow key={rowKey(row)} className={rowClassName?.(row)}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={`${c.mono ? "font-mono text-xs" : ""} ${c.align === "right" ? "whitespace-nowrap text-right" : c.align === "center" ? "text-center" : ""} ${c.className ?? ""}`}>
                        {c.render ? c.render(row) : c.value(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <DataPagination pager={pager} label={label} />
      {footer}
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "green" | "amber" | "red" | "slate" | "blue"; children: ReactNode }) {
  const tones = {
    green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-rose-100 text-rose-800",
    slate: "bg-slate-100 text-slate-700", blue: "bg-sky-100 text-sky-800",
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
