"use client";

import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search } from "lucide-react";

import { AdminList, type AdminRow } from "@/components/proprietor/admin-list";
import { ErrorState, PageHeader, RowsSkeleton, useTr } from "@/components/proprietor/common";
import { PROPRIETOR_OVERVIEW_KEY } from "@/components/proprietor/overview";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { proprietorService } from "@/lib/api/services/proprietor.service";

const ALL = "__all__";

export default function ProprietorAdminsPage() {
  const tr = useTr();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState(ALL);

  const overview = useQuery({ queryKey: PROPRIETOR_OVERVIEW_KEY, queryFn: () => proprietorService.overview(), staleTime: 60_000 });
  const schools = overview.data?.schools ?? [];
  const adminQueries = useQueries({
    queries: schools.map((s) => ({
      queryKey: ["proprietor", "admins", s.id],
      queryFn: () => proprietorService.admins(s.id),
    })),
  });

  const rows: AdminRow[] = useMemo(
    () =>
      adminQueries.flatMap((q, i) =>
        (q.data?.admins ?? []).map((a) => ({ ...a, schoolId: schools[i].id, schoolName: schools[i].name })),
      ),
    [adminQueries, schools],
  );
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (schoolFilter === ALL || r.schoolId === schoolFilter) &&
      (!needle || [r.name, r.matricule, r.email, r.schoolName].some((v) => (v || "").toLowerCase().includes(needle))),
  );
  const loading = overview.isLoading || (schools.length > 0 && adminQueries.some((q) => q.isLoading));
  const failed = adminQueries.find((q) => q.isError);

  if (user?.role !== "PROPRIETOR") return null;

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title={tr("Admin accounts", "Comptes administrateurs")}
        subtitle={tr("Every administrator of your schools. You can set new login details for any of them.", "Tous les administrateurs de vos écoles. Vous pouvez définir de nouveaux identifiants pour chacun.")}
        icon={<KeyRound className="h-6 w-6" />}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Search by name, matricule or email", "Rechercher par nom, matricule ou e-mail")} className="h-11 rounded-xl bg-white pl-9" aria-label={tr("Search administrators", "Rechercher des administrateurs")} />
        </div>
        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger className="h-11 rounded-xl bg-white sm:w-64" aria-label={tr("School", "École")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tr("All schools", "Toutes les écoles")}</SelectItem>
            {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <RowsSkeleton rows={4} />
      ) : overview.isError ? (
        <ErrorState message={getApiErrorMessage(overview.error)} onRetry={() => overview.refetch()} retrying={overview.isFetching} />
      ) : failed ? (
        <ErrorState message={getApiErrorMessage(failed.error)} onRetry={() => adminQueries.forEach((q) => q.refetch())} />
      ) : (
        <AdminList rows={filtered} showSchool onChanged={() => queryClient.invalidateQueries({ queryKey: ["proprietor"] })} />
      )}
    </div>
  );
}
