"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, Lock, PencilLine, Search, ShieldCheck, Users } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { useToast } from "@/hooks/use-toast";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { schoolsService } from "@/lib/api/services/schools.service";
import { studentsService } from "@/lib/api/services/students.service";

/**
 * Student Management — class masters only.
 *
 * Visible when the school admin has switched on "class masters can edit their
 * student informations". A class master sees ONLY the students of the classes
 * they are master of, and can update student information and photos — never
 * payments.
 */

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const normalizeList = (payload: any): any[] =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];

export default function StudentManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const schoolId = user?.school?.id || (user as any)?.school_id || "";
  const isTeacher = user?.role === "TEACHER";

  const { data: schoolSettings, isLoading: settingsLoading } = useSchoolSettings(schoolId);
  const permissionOn = Boolean((schoolSettings as any)?.class_masters_can_edit_students);

  const classesQuery = useQuery({
    queryKey: ["cm-classes", schoolId],
    queryFn: async () => normalizeList(await schoolsService.getSchoolClasses(schoolId)),
    enabled: Boolean(schoolId && isTeacher && permissionOn),
  });
  const classes = classesQuery.data || [];
  const myClasses = useMemo(
    () => classes.filter((c: any) => String(c.class_master || "") === String(user?.id)),
    [classes, user?.id],
  );
  const myClassIds = useMemo(() => new Set(myClasses.map((c: any) => String(c.id))), [myClasses]);
  const myClassNames = useMemo(() => new Set(myClasses.map((c: any) => String(c.name))), [myClasses]);

  const studentsQuery = useQuery({
    queryKey: ["cm-students", schoolId],
    queryFn: async () => normalizeList(await studentsService.getStudents({ page_size: 1000 } as any)),
    enabled: Boolean(schoolId && isTeacher && permissionOn && myClasses.length > 0),
  });

  // Strictly limit to the master's own classes.
  const students = useMemo(
    () => (studentsQuery.data || []).filter((s: any) =>
      myClassIds.has(String(s.school_class_id || s.school_class || "")) || myClassNames.has(String(s.student_class || "")),
    ),
    [studentsQuery.data, myClassIds, myClassNames],
  );

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s: any) => {
      const name = s.user?.name || s.student_name || "";
      const matricule = s.user?.matricule || "";
      const matchesSearch = !term || name.toLowerCase().includes(term) || matricule.toLowerCase().includes(term) || (s.admission_number || "").toLowerCase().includes(term);
      const matchesClass = classFilter === "all" || String(s.student_class || "") === classFilter;
      return matchesSearch && matchesClass;
    });
  }, [students, search, classFilter]);
  const pager = usePagination(filtered, 20);

  // Edit dialog
  const [editing, setEditing] = useState<any | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");

  useEffect(() => {
    if (editing) {
      setPhotoPreview("");
      setEditData({
        name: editing.user?.name ?? "",
        phone: editing.user?.phone ?? "",
        whatsapp: editing.user?.whatsapp ?? "",
        date_of_birth: editing.date_of_birth ?? "",
        gender: (editing.gender?.toLowerCase?.() as string) ?? "male",
        guardian_name: editing.guardian_name ?? "",
        guardian_phone: editing.guardian_phone ?? "",
        guardian_whatsapp: editing.guardian_whatsapp ?? "",
      });
    }
  }, [editing]);

  const handleUploadPhoto = async (file: File | undefined | null) => {
    if (!file || !editing) return;
    setUploadingPhoto(true);
    try {
      const result = await studentsService.uploadStudentPhoto(String(editing.id), file);
      setPhotoPreview(result.avatar || "");
      toast({ title: "Photo updated", description: "The student's profile picture was uploaded." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Photo upload failed", description: error?.response?.data?.detail || "Use a clear image under 6MB." });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await studentsService.updateStudent(String(editing.id), editData as any);
      await queryClient.invalidateQueries({ queryKey: ["cm-students"] });
      setEditing(null);
      toast({ title: "Student updated", description: "The learner record was updated successfully." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: error?.response?.data?.detail || "We could not save the changes." });
    } finally {
      setSaving(false);
    }
  };

  if (!isTeacher) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Lock className="h-12 w-12 text-destructive" />
        <h2 className="text-lg font-bold">Student Management is for class masters only.</h2>
      </div>
    );
  }

  if (!settingsLoading && !permissionOn) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Lock className="h-12 w-12 text-primary/30" />
        <h2 className="text-lg font-bold text-primary">Permission not granted</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The school administrator has not yet given class masters permission to manage their student information.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl border-2 border-white bg-primary p-3 shadow-xl">
          <Users className="h-6 w-6 text-secondary md:h-8 md:w-8" />
        </div>
        <div>
          <h1 className="font-headline text-2xl font-bold uppercase tracking-tighter text-primary md:text-3xl">Student Management</h1>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            Manage the information of the students in {myClasses.length === 1 ? `your class (${myClasses[0]?.name})` : "the classes you are class master of"}. Payments stay with the bursar.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold text-primary">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
        <span>You can edit student information and upload profile photos for your class only. You cannot record or make any payment.</span>
      </div>

      {settingsLoading || classesQuery.isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-3xl border bg-white"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : myClasses.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <GraduationCap className="h-10 w-10 text-primary/20" />
            <p className="font-bold text-primary">You are not registered as the class master of any class.</p>
            <p className="max-w-md text-sm text-muted-foreground">Ask the school administrator to appoint you as a class master in Hierarchy &amp; Sections.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-sm rounded-[2rem]">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary">My Class Students</CardTitle>
            <CardDescription>{filtered.length} student(s) across {myClasses.length} class(es).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-10" placeholder="Search name, matricule or admission no..." />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All my classes</SelectItem>
                  {myClasses.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-2xl border">
              <Table className="min-w-[720px]">
                <TableHeader className="bg-primary">
                  <TableRow className="hover:bg-primary">
                    <TableHead className="pl-6 text-xs font-black uppercase tracking-widest text-white">Student</TableHead>
                    <TableHead className="text-xs font-black uppercase tracking-widest text-white">Matricule</TableHead>
                    <TableHead className="text-xs font-black uppercase tracking-widest text-white">Class</TableHead>
                    <TableHead className="text-xs font-black uppercase tracking-widest text-white">Guardian</TableHead>
                    <TableHead className="pr-6 text-right text-xs font-black uppercase tracking-widest text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentsQuery.isLoading ? (
                    <TableRow><TableCell colSpan={5} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary/40" /></TableCell></TableRow>
                  ) : pager.pageItems.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">No students match the current filters.</TableCell></TableRow>
                  ) : pager.pageItems.map((s: any) => (
                    <TableRow key={s.id} className="odd:bg-accent/5">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={s.user?.avatar || ""} />
                            <AvatarFallback className="bg-primary/5 text-xs font-black text-primary">{(s.user?.name || "S").charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-black text-primary">{s.user?.name || "Student"}</p>
                            <p className="text-xs text-muted-foreground">{s.admission_number || ""}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.user?.matricule || "—"}</TableCell>
                      <TableCell>{s.student_class || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.guardian_name || "—"}</TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={() => setEditing(s)}>
                          <PencilLine className="mr-2 h-4 w-4" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DataPagination pager={pager} label="students" />
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-primary">Edit Student</DialogTitle>
            <DialogDescription>Update {editing?.user?.name || "the student"}&apos;s information. Class and payments are managed by the school.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-4 sm:col-span-2 rounded-2xl border bg-accent/10 p-4">
              <Avatar className="h-16 w-16 border-2 border-primary/20">
                <AvatarImage src={photoPreview || editing?.user?.avatar || ""} />
                <AvatarFallback className="bg-primary/5 font-black text-primary">{(editing?.user?.name || "S").charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <Label>Profile Photo</Label>
                <Input type="file" accept="image/*" disabled={uploadingPhoto} onChange={(e) => void handleUploadPhoto(e.target.files?.[0])} className="h-11 rounded-xl" />
                <p className="text-[10px] text-muted-foreground">{uploadingPhoto ? "Uploading photo..." : "Shown on the ID card, report card and community profile."}</p>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>Full Name</Label><Input value={editData.name || ""} onChange={(e) => setEditData((c) => ({ ...c, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={editData.phone || ""} onChange={(e) => setEditData((c) => ({ ...c, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>WhatsApp</Label><Input value={editData.whatsapp || ""} onChange={(e) => setEditData((c) => ({ ...c, whatsapp: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Date of Birth</Label><Input type="date" value={editData.date_of_birth || ""} onChange={(e) => setEditData((c) => ({ ...c, date_of_birth: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={editData.gender || "male"} onValueChange={(v) => setEditData((c) => ({ ...c, gender: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{GENDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Guardian Name</Label><Input value={editData.guardian_name || ""} onChange={(e) => setEditData((c) => ({ ...c, guardian_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Guardian Phone</Label><Input value={editData.guardian_phone || ""} onChange={(e) => setEditData((c) => ({ ...c, guardian_phone: e.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Guardian WhatsApp</Label><Input value={editData.guardian_whatsapp || ""} onChange={(e) => setEditData((c) => ({ ...c, guardian_whatsapp: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
