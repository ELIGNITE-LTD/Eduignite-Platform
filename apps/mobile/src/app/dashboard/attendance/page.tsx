"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  CalendarIcon,
  CheckCircle2,
  Clock,
  History,
  ShieldCheck,
  ArrowRight,
  FileDown,
  Eye,
  CalendarDays,
  ArrowLeft,
  Loader2,
  Save,
  Check,
  X,
  Award,
  Zap,
  Pencil,
  XCircle,
  Users,
  LayoutGrid,
  Activity,
  TrendingUp,
  Filter,
  Search,
  User,
  Printer,
  QrCode,
  AlertCircle,
  RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { attendanceService } from "@/lib/api/services/attendance.service";
import { studentsService } from "@/lib/api/services/students.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { useSubjects } from "@/lib/hooks/useGrades";
import { useSchoolSettings } from "@/lib/hooks/useSchools";

function parseSubjectPlacement(level?: string) {
  const raw = (level || "").trim();
  if (!raw) return [];
  if (!raw.includes("||")) {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
  const [, classes] = raw.split("||");
  return (classes || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function buildStudentAttendanceSummary(records: any[]) {
  const normalizedRecords = Array.isArray(records) ? records : [];
  const totalDays = normalizedRecords.length;
  const presentDays = normalizedRecords.filter((record) => record?.status === "present").length;
  const absentDays = normalizedRecords.filter((record) => record?.status === "absent").length;
  const lateDays = normalizedRecords.filter((record) => record?.status === "late").length;
  const excusedDays = normalizedRecords.filter((record) => record?.status === "excused").length;
  const attendancePercentage = totalDays
    ? Number((((presentDays + lateDays) / totalDays) * 100).toFixed(2))
    : 0;

  return {
    total_days: totalDays,
    present_days: presentDays,
    absent_days: absentDays,
    late_days: lateDays,
    excused_days: excusedDays,
    attendance_percentage: attendancePercentage,
  };
}

export default function AttendancePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [attendanceSessions, setAttendanceSessions] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [myAttendance, setMyAttendance] = useState<any[]>([]);
  const [absentToday, setAbsentToday] = useState<any[]>([]);
  const [classAttendanceReport, setClassAttendanceReport] = useState<any[]>([]);
  const [studentSummary, setStudentSummary] = useState<any>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<any[]>([]);
  const [classSubjectLinks, setClassSubjectLinks] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [bulkAttendanceData, setBulkAttendanceData] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const isTeacher = user?.role === "TEACHER";
  const isStudent = user?.role === "STUDENT";
  const isParent = user?.role === "PARENT";
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const schoolId = user?.school?.id || user?.school_id || user?.schoolId || "";
  const { data: schoolSettings } = useSchoolSettings(user?.school?.id || "");
  const { data: subjectsData } = useSubjects({ limit: 200 });

  // A teacher's real classes and subjects come from their ClassSubject
  // assignments (hierarchy subjects), not the subject catalogue.
  const teacherLinks = useMemo(
    () => classSubjectLinks.filter(
      (link: any) => String(link.teacher || "") === String(user?.id) || String(link.teacher || "") === String((user as any)?.uid),
    ),
    [classSubjectLinks, user?.id, user],
  );

  const availableClasses = useMemo(() => {
    if (isTeacher) {
      const teacherClasses = Array.from(new Set(teacherLinks.map((link: any) => link.class_name).filter(Boolean)));
      if (teacherClasses.length) return teacherClasses as string[];
    }
    const subjectList = subjectsData?.results || [];
    const subjectClasses = subjectList.flatMap((subject: any) => parseSubjectPlacement(subject.level));
    const settingsClasses = schoolSettings?.class_levels || [];
    const relationalClasses = schoolClasses.map((cls) => cls.name).filter(Boolean);
    return Array.from(new Set([...relationalClasses, ...subjectClasses, ...settingsClasses].filter(Boolean)));
  }, [isTeacher, teacherLinks, schoolClasses, schoolSettings?.class_levels, subjectsData?.results]);

  const availableSubjects = useMemo(() => {
    if (!isTeacher) return [];
    // Only the subjects this teacher teaches in the selected class.
    const scoped = selectedClass
      ? teacherLinks.filter((link: any) => String(link.class_name) === String(selectedClass))
      : teacherLinks;
    const byId = new Map<string, any>();
    scoped.forEach((link: any) => {
      if (!link.subject) return;
      byId.set(String(link.subject), { id: String(link.subject), name: link.subject_name || "Subject" });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isTeacher, selectedClass, teacherLinks]);

  useEffect(() => {
    if (!availableClasses.length) return;
    setSelectedClass((current) => (current && availableClasses.includes(current) ? current : availableClasses[0]));
  }, [availableClasses]);

  useEffect(() => {
    if (!availableSubjects.length) {
      setSelectedSubject("");
      return;
    }
    setSelectedSubject((current) => (
      current && availableSubjects.some((subject: any) => subject.id === current) ? current : availableSubjects[0].id
    ));
  }, [availableSubjects]);

  useEffect(() => {
    if (!schoolId || (!isTeacher && !isAdmin)) {
      setSchoolClasses([]);
      return;
    }

    const loadSchoolClasses = async () => {
      try {
        const data = await schoolsService.getSchoolClasses(schoolId);
        setSchoolClasses(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error loading school classes for attendance:", error);
        setSchoolClasses([]);
      }
    };

    loadSchoolClasses();
  }, [schoolId, isTeacher, isAdmin]);

  // Load the teacher/admin's class-subject assignments so a teacher can pick the
  // exact subject they are taking attendance in.
  useEffect(() => {
    if (!schoolId || (!isTeacher && !isAdmin)) {
      setClassSubjectLinks([]);
      return;
    }
    const loadClassSubjects = async () => {
      try {
        const data = await schoolsService.getHierarchySubjects({ school_id: schoolId });
        setClassSubjectLinks(Array.isArray(data) ? data : (data as any)?.results || []);
      } catch (error) {
        console.error("Error loading class-subject assignments for attendance:", error);
        setClassSubjectLinks([]);
      }
    };
    loadClassSubjects();
  }, [schoolId, isTeacher, isAdmin]);

  // Load attendance data based on role
  useEffect(() => {
    const loadAttendanceData = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        if (isStudent) {
          const attendanceData = await attendanceService.getMyAttendance({ limit: 200 });
          const normalizedAttendance = Array.isArray(attendanceData) ? attendanceData : attendanceData?.results || [];
          setMyAttendance(normalizedAttendance);
          setStudentSummary(buildStudentAttendanceSummary(normalizedAttendance));

          try {
            const currentStudent = await studentsService.getMyProfile();
            setStudentProfile(currentStudent);

            if (currentStudent?.id) {
              try {
                const summaryData = await attendanceService.getStudentSummary(currentStudent.id);
                setStudentSummary(summaryData);
              } catch (summaryError) {
                console.error("Error loading student attendance summary:", summaryError);
              }
            }
          } catch (studentError) {
            console.error("Error loading student profile for attendance:", studentError);
          }
        } else if (isTeacher) {
          const data = await attendanceService.getAttendanceSessions({ limit: 100 });
          setAttendanceSessions(Array.isArray(data) ? data : data?.results || []);
        } else if (isAdmin) {
          const data = await attendanceService.getAttendanceRecords({ limit: 200 });
          setAttendanceRecords(Array.isArray(data) ? data : data?.results || []);

          const absentData = await attendanceService.getAbsentToday();
          setAbsentToday(Array.isArray(absentData) ? absentData : absentData?.students || []);
        } else if (isParent) {
          const data = await attendanceService.getAttendanceRecords({ limit: 500, include_history: true } as any);
          const normalizedAttendance = Array.isArray(data) ? data : data?.results || [];
          setMyAttendance(normalizedAttendance);
          setStudentSummary(buildStudentAttendanceSummary(normalizedAttendance));
        }
      } catch (error) {
        console.error("Error loading attendance:", error);
        setHasError(true);
        toast({ title: "Error", description: "Failed to load attendance data", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    loadAttendanceData();
  }, [isStudent, isTeacher, isAdmin, isParent, reloadNonce, toast]);

  useEffect(() => {
    if (!selectedClass || (!isTeacher && !isAdmin)) {
      setClassStudents([]);
      return;
    }

    const loadClassStudents = async () => {
      try {
        const data = await studentsService.getClassList(selectedClass);
        setClassStudents(Array.isArray(data) ? data : data?.results || []);
      } catch (error) {
        console.error("Error loading class students:", error);
        setClassStudents([]);
      }
    };

    loadClassStudents();
  }, [selectedClass, isTeacher, isAdmin]);

  const handleRecordAttendance = async (studentId: string, status: string) => {
    setBulkAttendanceData((prev) => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleSubmitAttendance = async () => {
    if (!selectedClass) {
      toast({ title: "Error", description: "Please select a class", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const data = await attendanceService.bulkRecordAttendance({
        sessionId: "",
        records: classStudents.map((student: any) => ({
          student: student.id,
          status: ((bulkAttendanceData[student.id] || "present").toLowerCase() as any),
        })),
        student_class: selectedClass,
        date: selectedDate,
        period: "full_day",
        subject: selectedSubject || undefined,
      } as any);
      setAttendanceSessions([data.session, ...attendanceSessions]);
      setBulkAttendanceData({});
      toast({ title: "Success", description: "Attendance recorded successfully" });
    } catch (error) {
      console.error("Error recording attendance:", error);
      toast({ title: "Error", description: "Failed to record attendance", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClassReport = async () => {
    if (!selectedClass || !dateFrom || !dateTo) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const data = await attendanceService.getClassReport(selectedClass, dateFrom, dateTo);
      setClassAttendanceReport(Array.isArray(data) ? data : data?.report || []);
      toast({ title: "Success", description: "Report generated" });
    } catch (error) {
      console.error("Error generating report:", error);
      toast({ title: "Error", description: "Failed to generate report", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = () => {
    setHasError(false);
    setReloadNonce((current) => current + 1);
  };

  if (hasError && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-lg font-bold">Failed to Load Attendance</h2>
        <p className="text-sm text-muted-foreground">Please try again.</p>
        <Button onClick={handleRetry}>
          <RotateCcw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  // Student View
  if (isStudent) {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">My Attendance</h1>
            <p className="text-muted-foreground mt-1 text-sm">View your attendance record and percentage.</p>
          </div>
        </div>

        {studentSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Attendance Rate</p>
                <p className="text-3xl font-black text-primary">{studentSummary.attendance_percentage || studentSummary.percentage || 0}%</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Present</p>
                <p className="text-3xl font-black text-green-600">{studentSummary.present_days || studentSummary.present || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Absent</p>
                <p className="text-3xl font-black text-destructive">{studentSummary.absent_days || studentSummary.absent || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Total Sessions</p>
                <p className="text-3xl font-black text-blue-600">{studentSummary.total_days || studentSummary.total || 0}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Attendance History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : myAttendance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No attendance records yet</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Teacher</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myAttendance.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-bold">{record.session_date || record.session?.date || record.date}</TableCell>
                        <TableCell>{record.session_subject_name || record.session?.subject_name || record.subject || "General"}</TableCell>
                        <TableCell className="text-sm">{record.session_teacher_name || record.session?.teacher_name || record.teacherName || "N/A"}</TableCell>
                        <TableCell>
                          <Badge className={cn(record.status === "present" ? "bg-green-600" : record.status === "absent" ? "bg-destructive" : "bg-amber-500")}>
                            {record.status?.toUpperCase() || "N/A"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isParent) {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">Children Attendance</h1>
            <p className="text-muted-foreground mt-1 text-sm">Published attendance records for your linked children.</p>
          </div>
        </div>

        {studentSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Attendance Rate</p>
                <p className="text-3xl font-black text-primary">{studentSummary.attendance_percentage || 0}%</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Present</p>
                <p className="text-3xl font-black text-green-600">{studentSummary.present_days || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Absent</p>
                <p className="text-3xl font-black text-destructive">{studentSummary.absent_days || 0}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground font-bold">Total Sessions</p>
                <p className="text-3xl font-black text-blue-600">{studentSummary.total_days || 0}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Children Attendance History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : myAttendance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No attendance records yet</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Child</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myAttendance.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-bold">{record.student_name || record.student?.user?.name || "Student"}</TableCell>
                        <TableCell>{record.session_student_class || record.session?.student_class || "-"}</TableCell>
                        <TableCell className="font-bold">{record.session_date || record.session?.date || record.date}</TableCell>
                        <TableCell>{record.session_subject_name || record.session?.subject_name || "General"}</TableCell>
                        <TableCell>
                          <Badge className={cn(record.status === "present" ? "bg-green-600" : record.status === "absent" ? "bg-destructive" : "bg-amber-500")}>
                            {record.status?.toUpperCase() || "N/A"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Teacher View
  if (isTeacher) {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">Mark Attendance</h1>
            <p className="text-muted-foreground mt-1 text-sm">Record student attendance for your classes.</p>
          </div>
        </div>

        <Tabs defaultValue="record" className="w-full">
          <TabsList className="grid w-full mb-8 bg-white shadow-sm border h-auto p-1.5 rounded-2xl grid-cols-2">
            <TabsTrigger value="record" className="gap-2 py-3 rounded-xl transition-all font-bold text-xs sm:text-sm">
              <CheckCircle2 className="w-4 h-4" /> Record Attendance
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 py-3 rounded-xl transition-all font-bold text-xs sm:text-sm">
              <History className="w-4 h-4" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">Class</Label>
                  <Select value={selectedClass} onValueChange={setSelectedClass}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Choose class..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableClasses.map((cls) => (
                        <SelectItem key={cls} value={cls}>
                          {cls}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">Subject</Label>
                  <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Choose subject..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubjects.map((subject: any) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">Date</Label>
                  <Input
                    type="date"
                    className="h-12 rounded-xl"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
              </div>

              <Card className="border-none shadow-sm bg-white/50 overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg">Mark Attendance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {classStudents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Select a class to view students
                      </div>
                    ) : (
                      classStudents.map((student: any) => (
                        <div key={student.id} className="flex items-center justify-between rounded-xl border p-3">
                          <div>
                            <p className="font-bold text-primary">{student.user?.name || student.student_name}</p>
                            <p className="text-xs text-muted-foreground">{student.admission_number}</p>
                          </div>
                          <div className="flex gap-2">
                            {["present", "late", "absent", "excused"].map((status) => (
                              <Button
                                key={status}
                                type="button"
                                size="sm"
                                variant={bulkAttendanceData[student.id] === status ? "default" : "outline"}
                                onClick={() => handleRecordAttendance(student.id, status)}
                                className="capitalize"
                              >
                                {status}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button
                className="w-full h-12 font-black uppercase gap-2 rounded-xl"
                onClick={handleSubmitAttendance}
                disabled={isProcessing || !selectedClass}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Submit Attendance
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Recent Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : attendanceSessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No attendance sessions yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Present</TableHead>
                          <TableHead>Absent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attendanceSessions.map((session: any) => (
                          <TableRow key={session.id}>
                            <TableCell className="font-bold">{session.date}</TableCell>
                            <TableCell>{session.student_class || session.className}</TableCell>
                            <TableCell>{session.subject_name || session.subject || "General"}</TableCell>
                            <TableCell className="font-bold text-green-600">{session.total_present ?? session.present ?? 0}</TableCell>
                            <TableCell className="font-bold text-destructive">{session.total_absent ?? session.absent ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Admin View
  if (isAdmin) {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">Attendance Management</h1>
            <p className="text-muted-foreground mt-1 text-sm">Monitor attendance across all classes.</p>
          </div>
        </div>

        {absentToday.length > 0 && (
          <Card className="border-destructive/20 bg-destructive/5 shadow-sm">
            <CardHeader>
              <CardTitle className="text-destructive">Today's Absences ({absentToday.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {absentToday.map((student: any) => (
                  <div key={student.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-destructive/20">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={student.avatar} />
                        <AvatarFallback>{student.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-bold">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{student.class}</p>
                      </div>
                    </div>
                    <Badge variant="destructive">Absent</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="report" className="w-full">
          <TabsList className="grid w-full mb-8 bg-white shadow-sm border h-auto p-1.5 rounded-2xl grid-cols-2">
            <TabsTrigger value="report" className="gap-2 py-3 rounded-xl transition-all font-bold text-xs sm:text-sm">
              <FileDown className="w-4 h-4" /> Attendance Report
            </TabsTrigger>
            <TabsTrigger value="records" className="gap-2 py-3 rounded-xl transition-all font-bold text-xs sm:text-sm">
              <History className="w-4 h-4" /> Records
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-6">
              <h2 className="text-lg font-bold">Generate Class Report</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">Class</Label>
                  <Select value={selectedClass} onValueChange={setSelectedClass}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Choose class..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableClasses.map((cls) => (
                        <SelectItem key={cls} value={cls}>
                          {cls}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">From Date</Label>
                  <Input type="date" className="h-12 rounded-xl" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">To Date</Label>
                  <Input type="date" className="h-12 rounded-xl" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>

              <Button
                className="w-full h-12 font-black uppercase gap-2 rounded-xl"
                onClick={handleClassReport}
                disabled={isProcessing || !selectedClass || !dateFrom || !dateTo}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Generate Report
              </Button>

              {classAttendanceReport.length > 0 && (
                <Card className="border-none shadow-sm bg-white/50 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-base">Report Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Present</TableHead>
                            <TableHead>Absent</TableHead>
                            <TableHead>Percentage</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {classAttendanceReport.map((student: any) => (
                            <TableRow key={student.id}>
                              <TableCell className="font-bold">{student.name}</TableCell>
                              <TableCell className="text-green-600 font-bold">{student.present}</TableCell>
                              <TableCell className="text-destructive font-bold">{student.absent}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Progress value={student.percentage} className="w-16 h-2" />
                                  <span className="text-sm font-bold">{student.percentage}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="records" className="space-y-6">
            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle>All Attendance Records</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : attendanceRecords.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No attendance records yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Teacher</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attendanceRecords.map((record: any) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-bold">{record.student_name || record.studentName}</TableCell>
                            <TableCell>{record.session?.student_class || record.className}</TableCell>
                            <TableCell className="text-sm">{record.session?.date || record.date}</TableCell>
                            <TableCell>
                              <Badge className={cn(record.status === "present" ? "bg-green-600" : record.status === "absent" ? "bg-destructive" : "bg-amber-500")}>
                                {record.status?.toUpperCase() || "N/A"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{record.session?.teacher_name || record.teacherName || "N/A"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return null;
}
