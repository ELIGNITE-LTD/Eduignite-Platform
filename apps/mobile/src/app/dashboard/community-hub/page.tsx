"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api/client";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { CalendarDays, Loader2, Search, Users } from "lucide-react";

/**
 * Community tab: a searchable directory of the whole school — Students,
 * Staff, Parents and Events. Reads /schools/community/, which every member
 * of the school can access (no role restrictions), so students, parents and
 * staff all see exactly what the school admin sees.
 *
 * Ordering: students from the highest class to the lowest, parents from the
 * most children in the school to the fewest, staff from the highest rank
 * (administrators) down to teachers.
 */

type Section = "students" | "staff" | "parents" | "events";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "staff", label: "Staff" },
  { id: "parents", label: "Parents" },
  { id: "events", label: "Events" },
];

const STAFF_ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: "Administrator",
  SUB_ADMIN: "Sub-Admin",
  BURSAR: "Bursar",
  LIBRARIAN: "Librarian",
  TEACHER: "Teacher",
};

// Highest rank first.
const STAFF_RANK: Record<string, number> = {
  SCHOOL_ADMIN: 0,
  SUB_ADMIN: 1,
  BURSAR: 2,
  LIBRARIAN: 3,
  TEACHER: 4,
};

/** Cameroon secondary class seniority — bigger = higher class. */
const classRank = (raw?: string): number => {
  const value = (raw || "").toLowerCase();
  if (!value) return 0;
  if (/upper\s*sixth/.test(value) || /terminale/.test(value)) return 7;
  if (/lower\s*sixth/.test(value) || /premi[eè]re/.test(value)) return 6;
  if (/form\s*5/.test(value) || /seconde/.test(value)) return 5;
  if (/form\s*4/.test(value) || /(troisi[eè]me|3\s*[eè]me)/.test(value)) return 4;
  if (/form\s*3/.test(value) || /4\s*[eè]me/.test(value)) return 3;
  if (/form\s*2/.test(value) || /5\s*[eè]me/.test(value)) return 2;
  if (/form\s*1/.test(value) || /(sixi[eè]me|6\s*[eè]me)/.test(value)) return 1;
  const numeric = value.match(/\d+/);
  return numeric ? Number(numeric[0]) : 0;
};

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

function DirectoryCard({
  avatar,
  name,
  role,
  idLabel,
  footerLeft,
  online,
  onView,
}: {
  avatar?: string;
  name: string;
  /** Subtitle under the name, e.g. "Student" or "Mathematics Teacher". */
  role: string;
  /** Identity number shown under the role, e.g. matricule / EMP id. */
  idLabel?: string;
  /** Left side of the footer row (e.g. the class). When omitted, "Active" is centered. */
  footerLeft?: string;
  /** Green dot on the photo — shown ONLY while the user is online. */
  online?: boolean;
  onView?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/10 text-5xl font-black text-primary">
            {(name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        {online ? (
          <span
            className="absolute right-2.5 top-2.5 h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-white"
            aria-label="Online"
          />
        ) : null}
      </div>
      <div className="px-3 pb-1 pt-3 text-center">
        <p className="truncate text-[15px] font-black leading-tight text-foreground">{name}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{role}</p>
        {idLabel ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">{idLabel}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "mx-3 mt-1 flex items-center border-t py-2 text-[11px]",
          footerLeft ? "justify-between" : "justify-center"
        )}
      >
        {footerLeft ? <span className="truncate text-muted-foreground">{footerLeft}</span> : null}
        <span className="text-muted-foreground">Active</span>
      </div>
      {onView ? (
        <div className="px-3 pb-3">
          <button
            onClick={onView}
            className="w-full rounded-xl bg-neutral-900 py-2.5 text-[12px] font-black text-white"
          >
            View Details
          </button>
        </div>
      ) : (
        <div className="pb-1.5" />
      )}
    </div>
  );
}

function SubFilterChips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (options.length <= 1) return null;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors",
            value === option.value
              ? "border-primary bg-primary text-white"
              : "border-border bg-white text-muted-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function CommunityHubPage() {
  const [section, setSection] = useState<Section>("students");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [childrenFilter, setChildrenFilter] = useState("all");
  const [eventOrder, setEventOrder] = useState("recent");
  const [viewingStaff, setViewingStaff] = useState<any | null>(null);

  // One whole-school directory call — identical data for every role.
  const directoryQuery = useQuery({
    queryKey: ["school-community"],
    queryFn: async () => (await apiClient.get("/schools/community/")).data,
  });
  const eventsQuery = useQuery({
    queryKey: ["school-events"],
    queryFn: async () =>
      normalizeList((await apiClient.get("/schools/events/", { params: { page_size: 200 } })).data),
  });

  const students = useMemo(
    () =>
      [...normalizeList(directoryQuery.data?.students)].sort(
        (a: any, b: any) =>
          classRank(b.class_name || b.class_level) - classRank(a.class_name || a.class_level) ||
          (a.name || "").localeCompare(b.name || "")
      ),
    [directoryQuery.data]
  );
  const staff = useMemo(
    () =>
      [...normalizeList(directoryQuery.data?.staff)].sort(
        (a: any, b: any) =>
          (STAFF_RANK[a.role] ?? 9) - (STAFF_RANK[b.role] ?? 9) ||
          (a.name || "").localeCompare(b.name || "")
      ),
    [directoryQuery.data]
  );
  const parents = useMemo(
    () =>
      [...normalizeList(directoryQuery.data?.parents)].sort(
        (a: any, b: any) =>
          (b.children_count || 0) - (a.children_count || 0) ||
          (a.name || "").localeCompare(b.name || "")
      ),
    [directoryQuery.data]
  );
  const events = useMemo(() => normalizeList(eventsQuery.data), [eventsQuery.data]);

  const classOptions = useMemo(() => {
    const names = new Set<string>();
    for (const student of students) {
      if (student.class_name) names.add(String(student.class_name));
    }
    return [
      { value: "all", label: "All classes" },
      ...Array.from(names)
        .sort((a, b) => classRank(b) - classRank(a) || a.localeCompare(b, undefined, { numeric: true }))
        .map((name) => ({ value: name, label: name })),
    ];
  }, [students]);

  const query = search.trim().toLowerCase();
  const matches = (...fields: (string | undefined | null)[]) =>
    !query || fields.some((f) => (f || "").toLowerCase().includes(query));

  const filteredStudents = useMemo(
    () =>
      students.filter((s: any) => {
        if (classFilter !== "all" && String(s.class_name || "") !== classFilter) return false;
        return matches(s.name, s.matricule, s.admission_number, s.class_name);
      }),
    [students, classFilter, query]
  );

  const filteredStaff = useMemo(
    () =>
      staff.filter((m: any) => {
        if (staffRoleFilter !== "all" && m.role !== staffRoleFilter) return false;
        return matches(m.name, m.matricule, STAFF_ROLE_LABELS[m.role] || m.role);
      }),
    [staff, staffRoleFilter, query]
  );

  const filteredParents = useMemo(
    () =>
      parents.filter((p: any) => {
        const count = Number(p.children_count || 0);
        if (childrenFilter === "1" && count !== 1) return false;
        if (childrenFilter === "2" && count !== 2) return false;
        if (childrenFilter === "3+" && count < 3) return false;
        return matches(p.name, p.matricule);
      }),
    [parents, childrenFilter, query]
  );

  const filteredEvents = useMemo(() => {
    const list = events.filter((e: any) => matches(e.title, e.description, e.location));
    return eventOrder === "recent" ? list : [...list].reverse();
  }, [events, eventOrder, query]);

  const isLoading = section === "events" ? eventsQuery.isLoading : directoryQuery.isLoading;

  const totals: Record<Section, { label: string; count: number }> = {
    students: { label: "Total Students", count: filteredStudents.length },
    staff: { label: "Total Staff", count: filteredStaff.length },
    parents: { label: "Total Parents", count: filteredParents.length },
    events: { label: "Total Events", count: filteredEvents.length },
  };

  const sectionTitles: Record<Section, string> = {
    students: "Student Directory",
    staff: "Staff Directory",
    parents: "Parent Directory",
    events: "School Events",
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search community..."
          className="h-11 rounded-2xl border-none bg-white pl-10 shadow-sm ring-1 ring-black/[0.04]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-foreground">Community</h1>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all",
              section === item.id
                ? "bg-primary text-white shadow-md"
                : "bg-white text-muted-foreground ring-1 ring-black/[0.05]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === "students" && (
        <SubFilterChips options={classOptions} value={classFilter} onChange={setClassFilter} />
      )}
      {section === "staff" && (
        <SubFilterChips
          options={[
            { value: "all", label: "All roles" },
            ...Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          value={staffRoleFilter}
          onChange={setStaffRoleFilter}
        />
      )}
      {section === "parents" && (
        <SubFilterChips
          options={[
            { value: "all", label: "All parents" },
            { value: "1", label: "1 child" },
            { value: "2", label: "2 children" },
            { value: "3+", label: "3+ children" },
          ]}
          value={childrenFilter}
          onChange={setChildrenFilter}
        />
      )}
      {section === "events" && (
        <SubFilterChips
          options={[
            { value: "recent", label: "Most recent" },
            { value: "oldest", label: "Oldest first" },
          ]}
          value={eventOrder}
          onChange={setEventOrder}
        />
      )}

      <div className="rounded-2xl bg-accent/40 px-4 py-2.5 text-center">
        <p className="text-[13px] font-black text-foreground">
          {totals[section].label}: {isLoading ? "…" : totals[section].count.toLocaleString()}
        </p>
      </div>

      <h2 className="text-lg font-black tracking-tight text-foreground">
        {sectionTitles[section]}
      </h2>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary/30" />
        </div>
      ) : section === "students" ? (
        filteredStudents.length === 0 ? (
          <EmptyState label="No students found" />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredStudents.map((s: any) => (
              <DirectoryCard
                key={s.id}
                avatar={resolveMediaUrl(s.avatar)}
                name={s.name || "Student"}
                role="Student"
                idLabel={s.matricule || s.admission_number || ""}
                footerLeft={s.class_name || s.class_level || "—"}
                online={Boolean(s.is_online)}
              />
            ))}
          </div>
        )
      ) : section === "staff" ? (
        filteredStaff.length === 0 ? (
          <EmptyState label="No staff found" />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredStaff.map((m: any) => (
              <DirectoryCard
                key={m.id}
                avatar={resolveMediaUrl(m.avatar)}
                name={m.name || "Staff"}
                role={
                  m.role === "TEACHER" && m.teaching?.[0]?.subject_name
                    ? `${m.teaching[0].subject_name} Teacher`
                    : STAFF_ROLE_LABELS[m.role] || m.role || "Staff"
                }
                idLabel={m.matricule || ""}
                online={Boolean(m.is_online)}
                onView={m.role === "TEACHER" ? () => setViewingStaff(m) : undefined}
              />
            ))}
          </div>
        )
      ) : section === "parents" ? (
        filteredParents.length === 0 ? (
          <EmptyState label="No parents found" />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredParents.map((p: any) => (
              <DirectoryCard
                key={p.id}
                avatar={resolveMediaUrl(p.avatar)}
                name={p.name || "Parent"}
                role="Parent"
                idLabel={p.matricule || ""}
                footerLeft={`Children: ${p.children_count || 0}`}
                online={Boolean(p.is_online)}
              />
            ))}
          </div>
        )
      ) : filteredEvents.length === 0 ? (
        <EmptyState label="No school events yet" />
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
          {filteredEvents.map((event: any) => (
            <div
              key={event.id}
              className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.03]"
            >
              {event.image ? (
                <img src={event.image} alt={event.title} className="h-40 w-full object-cover" />
              ) : null}
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black leading-snug text-foreground">
                    {event.title}
                  </p>
                  {event.description ? (
                    <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {event.description}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {event.event_date ? (
                      <span className="text-[11px] font-bold text-primary">
                        {new Date(event.event_date).toLocaleDateString([], {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    ) : null}
                    {event.location ? (
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        📍 {event.location}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingStaff ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setViewingStaff(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 bg-primary p-5 text-white">
              {resolveMediaUrl(viewingStaff.avatar) ? (
                <img src={resolveMediaUrl(viewingStaff.avatar)} alt={viewingStaff.name} className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 text-xl font-black">
                  {(viewingStaff.name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{viewingStaff.name}</p>
                <p className="text-xs text-white/70">{STAFF_ROLE_LABELS[viewingStaff.role] || viewingStaff.role} • {viewingStaff.matricule || "—"}</p>
              </div>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Classes & subjects taught
              </p>
              {(viewingStaff.teaching || []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No class-subject assignments yet.</p>
              ) : (
                (viewingStaff.teaching || []).map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-accent/40 px-4 py-3">
                    <span className="text-sm font-bold text-foreground">{t.subject_name || "Subject"}</span>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black text-primary">{t.class_name || "—"}</span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t p-4">
              <button
                onClick={() => setViewingStaff(null)}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-black text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed bg-white py-14 text-center">
      <Users className="h-9 w-9 text-primary/20" />
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
    </div>
  );
}
