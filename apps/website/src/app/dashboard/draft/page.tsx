"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Building2, CalendarClock, Loader2, RotateCcw, Search, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { schoolsService } from "@/lib/api/services/schools.service";
import { usersService } from "@/lib/api/services/users.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { ListParams, School, User } from "@/lib/api/types";

const RECOVERABLE_TEXT = "Recoverable for six months from the date it was moved to Draft.";
const DRAFT_ROLES = ["SUPER_ADMIN", "CEO", "CTO", "SCHOOL_ADMIN", "SUB_ADMIN"];
const FOUNDER_ROLES = ["SUPER_ADMIN", "CEO", "CTO"];

const normalizeResults = <T,>(payload: { results?: T[] } | T[] | null | undefined): T[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.results ?? [];
};

const getSchoolId = (user?: User | null) => {
  return user?.school?.id || user?.school_id || user?.schoolId || "";
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const draftReason = (record: Pick<User, "draftReason" | "draft_reason"> | Pick<School, "draftReason" | "draft_reason">) =>
  record.draftReason || record.draft_reason || "No reason provided.";

const draftDeadline = (record: Pick<User, "draftDeleteAfter" | "draft_delete_after"> | Pick<School, "draftDeleteAfter" | "draft_delete_after">) =>
  record.draftDeleteAfter || record.draft_delete_after || null;

const draftReminderCount = (
  record: Pick<User, "draftReminderCount" | "draft_reminder_count"> | Pick<School, "draftReminderCount" | "draft_reminder_count">
) => record.draftReminderCount ?? record.draft_reminder_count ?? 0;

export default function DraftRegistryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  const normalizedRole = (user?.role || "").toUpperCase();
  const isAllowed = DRAFT_ROLES.includes(normalizedRole);
  const isFounder = FOUNDER_ROLES.includes(normalizedRole);
  const schoolId = getSchoolId(user);

  const draftUserParams: ListParams = {
    page_size: 1000,
    limit: 1000,
    ordering: "name",
    ...(isFounder ? {} : { school: schoolId, school_id: schoolId }),
  };

  const schoolsQuery = useQuery({
    queryKey: ["draft-registry-schools", isFounder],
    queryFn: async () => normalizeResults<School>(await schoolsService.getDraftSchools({ page_size: 500, limit: 500 } as ListParams)),
    enabled: isAllowed && isFounder,
    initialData: [],
  });

  const usersQuery = useQuery({
    queryKey: ["draft-registry-users", draftUserParams],
    queryFn: async () => normalizeResults<User>(await usersService.getDraftUsers(draftUserParams)),
    enabled: isAllowed && (isFounder || Boolean(schoolId)),
    initialData: [],
  });

  const restoreSchoolMutation = useMutation({
    mutationFn: (id: string) => schoolsService.restoreSchool(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft-registry-schools"] });
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      toast({ title: "School restored", description: "The school and its linked users are active again." });
    },
    onError: (error) => toast({ variant: "destructive", title: "Restore failed", description: getApiErrorMessage(error) }),
  });

  const restoreUserMutation = useMutation({
    mutationFn: (id: string) => usersService.restoreUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft-registry-users"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User restored", description: "The account is active again with its previous data preserved." });
    },
    onError: (error) => toast({ variant: "destructive", title: "Restore failed", description: getApiErrorMessage(error) }),
  });

  const filteredSchools = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return schoolsQuery.data.filter((school) =>
      !query ||
      school.name?.toLowerCase().includes(query) ||
      school.id?.toLowerCase().includes(query) ||
      school.matricule?.toLowerCase().includes(query)
    );
  }, [schoolsQuery.data, searchTerm]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return usersQuery.data.filter((account) =>
      !query ||
      account.name?.toLowerCase().includes(query) ||
      account.email?.toLowerCase().includes(query) ||
      account.matricule?.toLowerCase().includes(query) ||
      account.role?.toLowerCase().includes(query)
    );
  }, [usersQuery.data, searchTerm]);

  if (!isAllowed) {
    return (
      <div className="rounded-[2rem] border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-black text-primary">Draft Registry</h1>
        <p className="mt-2 text-sm text-muted-foreground">Only founders and school administrators can recover temporarily deleted records.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
            <div className="rounded-xl bg-primary p-2 text-white shadow-lg">
              <Archive className="h-6 w-6 text-secondary" />
            </div>
            Draft Registry
          </h1>
          <p className="mt-1 text-muted-foreground">
            Temporarily deleted schools and users stay recoverable here for six months before permanent deletion.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm">
        <Search className="ml-2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search Draft by name, matricule, role, or school..."
          className="border-none bg-transparent focus-visible:ring-0"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className={`mb-8 grid h-auto w-full border bg-white p-1.5 shadow-sm ${isFounder ? "md:w-[460px] md:grid-cols-2" : "md:w-[240px] grid-cols-1"} rounded-3xl`}>
          <TabsTrigger value="users" className="gap-2 rounded-2xl py-3 text-xs font-bold transition-all sm:text-sm">
            <Users className="h-4 w-4" /> Users
          </TabsTrigger>
          {isFounder ? (
            <TabsTrigger value="schools" className="gap-2 rounded-2xl py-3 text-xs font-bold transition-all sm:text-sm">
              <Building2 className="h-4 w-4" /> Schools
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="users" className="mt-0 space-y-4">
          {usersQuery.isLoading ? <LoadingState label="Loading drafted users..." /> : null}
          {!usersQuery.isLoading && filteredUsers.length === 0 ? <EmptyState label="No users in Draft" /> : null}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredUsers.map((account) => (
              <Card key={account.id} className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg font-black uppercase text-primary">{account.name}</CardTitle>
                      <CardDescription className="mt-1">{account.email || "No email on file"}</CardDescription>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700">{account.role?.replace(/_/g, " ")}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 border-t bg-accent/5 p-6">
                  <DraftMeta reason={draftReason(account)} deleteAfter={draftDeadline(account)} reminders={draftReminderCount(account)} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Matricule: <span className="text-primary">{account.matricule || "Not assigned"}</span>
                    </p>
                    <Button
                      className="gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                      onClick={() => restoreUserMutation.mutate(account.id)}
                      disabled={restoreUserMutation.isPending}
                    >
                      {restoreUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Restore User
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {isFounder ? (
          <TabsContent value="schools" className="mt-0 space-y-4">
            {schoolsQuery.isLoading ? <LoadingState label="Loading drafted schools..." /> : null}
            {!schoolsQuery.isLoading && filteredSchools.length === 0 ? <EmptyState label="No schools in Draft" /> : null}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredSchools.map((school) => (
                <Card key={school.id} className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg font-black uppercase text-primary">{school.name}</CardTitle>
                        <CardDescription className="mt-1">{school.email || "No email on file"}</CardDescription>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700">{school.status || "Draft"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 border-t bg-accent/5 p-6">
                    <DraftMeta reason={draftReason(school)} deleteAfter={draftDeadline(school)} reminders={draftReminderCount(school)} />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        School matricule: <span className="text-primary">{school.matricule || school.id}</span>
                      </p>
                      <Button
                        className="gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        onClick={() => restoreSchoolMutation.mutate(school.id)}
                        disabled={restoreSchoolMutation.isPending}
                      >
                        {restoreSchoolMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restore School
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function DraftMeta({ reason, deleteAfter, reminders }: { reason: string; deleteAfter?: string | null; reminders: number }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
        <CalendarClock className="h-4 w-4" />
        Recoverable until {formatDate(deleteAfter)}
      </div>
      <p className="mt-2 text-xs font-medium leading-relaxed">{reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline" className="border-amber-300 bg-white text-[10px] text-amber-800">
          {RECOVERABLE_TEXT}
        </Badge>
        <Badge variant="outline" className="border-amber-300 bg-white text-[10px] text-amber-800">
          Reminder {reminders} / 6
        </Badge>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-[2rem] border bg-white py-12 text-sm font-bold text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      {label}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed bg-white py-16 text-center shadow-sm">
      <Archive className="h-10 w-10 text-primary/30" />
      <p className="mt-4 text-sm font-black uppercase tracking-widest text-primary">{label}</p>
      <p className="mt-2 max-w-md text-xs text-muted-foreground">
        Records moved to Draft will appear here until restored or permanently removed by the scheduled six-month cleanup.
      </p>
    </div>
  );
}
