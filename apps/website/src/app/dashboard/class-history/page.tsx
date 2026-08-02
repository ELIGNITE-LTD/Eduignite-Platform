"use client";

import { useMemo } from "react";
import { Archive, Award, BookOpen, CalendarDays, Download, FileBadge, GraduationCap, Loader2, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMyClassHistory } from "@/lib/hooks/useStudents";
import type { StudentClassHistoryRecord, StudentClassHistorySubject } from "@/lib/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { escapeHtml } from "@/lib/browser-download";
import { resolveMediaUrl } from "@/lib/media";
import { useToast } from "@/hooks/use-toast";

function asNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatAverage(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}/20` : "Pending";
}

function safeFilenameToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "class-history";
}

function statusBadgeClass(status: string) {
  if (status === "PROMOTED") return "bg-green-600 text-white";
  if (status === "REPEATED") return "bg-amber-600 text-white";
  if (status === "GRADUATED") return "bg-primary text-primary-foreground";
  return "bg-muted text-foreground";
}

function buildHistoryPdfHtml(record: StudentClassHistoryRecord, context: {
  studentName: string;
  matricule?: string;
  admissionNumber?: string;
  schoolName?: string;
  schoolLogo?: string;
  currentClass?: string;
}) {
  const logo = context.schoolLogo
    ? `<img src="${escapeHtml(context.schoolLogo)}" alt="School logo" style="width:70px;height:70px;object-fit:contain;border:1px solid #d7dde8;padding:6px;border-radius:10px;" />`
    : `<div style="width:70px;height:70px;border:1px solid #d7dde8;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#1a3c6e;">LOGO</div>`;
  const subjects = record.subjects.map((subject) => `
    <tr>
      <td>${escapeHtml(subject.subject_name)}</td>
      <td>${escapeHtml(subject.subject_code || "-")}</td>
      <td>${escapeHtml(subject.teacher_name || "-")}</td>
      <td>${escapeHtml(String(subject.coefficient ?? "-"))}</td>
      <td>${formatAverage(subject.average)}</td>
    </tr>
  `).join("");
  const terms = record.terms.map((term) => `
    <tr>
      <td>${escapeHtml(term.label || `Term ${term.term}`)}</td>
      <td>${formatAverage(term.average)}</td>
      <td>${escapeHtml(term.rank ? `${term.rank}/${term.total_students || "-"}` : "-")}</td>
      <td>${term.published ? "Published" : "Not published"}</td>
    </tr>
  `).join("");
  const reportCards = record.report_cards.map((card) => `
    <tr>
      <td>${escapeHtml(card.title || card.sequence_name || "Report Card")}</td>
      <td>${escapeHtml(card.scope || "-")}</td>
      <td>${formatAverage(card.average)}</td>
      <td>${card.published ? "Published" : "Not published"}</td>
    </tr>
  `).join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(record.class_name)} Academic Archive</title>
      <style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #111827; background: #fff; font-family: Arial, Helvetica, sans-serif; }
        .page { width: 794px; min-height: 1123px; margin: 0 auto; padding: 34px; background: white; }
        .header { display: flex; gap: 18px; align-items: center; border-bottom: 4px solid #1a3c6e; padding-bottom: 16px; }
        h1 { margin: 0; color: #1a3c6e; font-size: 24px; text-transform: uppercase; }
        h2 { color: #1a3c6e; font-size: 15px; text-transform: uppercase; margin: 24px 0 10px; }
        .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 16px; }
        .meta div, .stat { border: 1px solid #d7dde8; border-radius: 8px; padding: 10px; }
        .label { display: block; color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
        .value { font-size: 13px; font-weight: 800; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
        .stat strong { color: #1a3c6e; font-size: 18px; display:block; margin-top:4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
        th { background: #1a3c6e; color: white; text-align: left; padding: 8px; }
        td { border: 1px solid #d7dde8; padding: 8px; }
        tr:nth-child(even) td { background: #f8fafc; }
        .footer { margin-top: 28px; display:flex; justify-content:space-between; border-top:1px solid #d7dde8; padding-top:12px; color:#64748b; font-size:10px; }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="header">
          ${logo}
          <div>
            <h1>${escapeHtml(context.schoolName || "School")} Academic Archive</h1>
            <p style="margin:5px 0 0;font-weight:700;">Previous class record for ${escapeHtml(context.studentName)}</p>
            <p style="margin:4px 0 0;color:#64748b;font-size:12px;">Generated from EduIgnite live school records</p>
          </div>
        </section>
        <section class="meta">
          <div><span class="label">Student</span><span class="value">${escapeHtml(context.studentName)}</span></div>
          <div><span class="label">Matricule</span><span class="value">${escapeHtml(context.matricule || "-")}</span></div>
          <div><span class="label">Admission No.</span><span class="value">${escapeHtml(context.admissionNumber || "-")}</span></div>
          <div><span class="label">Current Class</span><span class="value">${escapeHtml(context.currentClass || "-")}</span></div>
          <div><span class="label">Archived Class</span><span class="value">${escapeHtml(record.class_name)}</span></div>
          <div><span class="label">Academic Year</span><span class="value">${escapeHtml(record.academic_year)}</span></div>
        </section>
        <section class="stats">
          <div class="stat"><span class="label">Annual Average</span><strong>${formatAverage(record.annual_average)}</strong></div>
          <div class="stat"><span class="label">Attendance</span><strong>${record.attendance.attendance_percentage.toFixed(1)}%</strong></div>
          <div class="stat"><span class="label">Subjects</span><strong>${record.subjects.length}</strong></div>
          <div class="stat"><span class="label">Decision</span><strong>${escapeHtml(record.status)}</strong></div>
        </section>
        <h2>Term Summary</h2>
        <table><thead><tr><th>Term</th><th>Average</th><th>Rank</th><th>Report Status</th></tr></thead><tbody>${terms || '<tr><td colspan="4">No term records found.</td></tr>'}</tbody></table>
        <h2>Subject Transcript</h2>
        <table><thead><tr><th>Subject</th><th>Code</th><th>Teacher</th><th>Coef.</th><th>Average</th></tr></thead><tbody>${subjects || '<tr><td colspan="5">No subject records found.</td></tr>'}</tbody></table>
        <h2>Report Cards</h2>
        <table><thead><tr><th>Document</th><th>Scope</th><th>Average</th><th>Status</th></tr></thead><tbody>${reportCards || '<tr><td colspan="4">No report cards found.</td></tr>'}</tbody></table>
        <div class="footer">
          <span>Issued by ${escapeHtml(context.schoolName || "the school")}</span>
          <span>${new Date().toLocaleDateString()}</span>
        </div>
      </main>
    </body>
  </html>`;
}

async function loadHistoryPdfImage(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addHistoryPdfImage(doc: any, dataUrl: string | null, x: number, y: number, width: number, height: number) {
  if (!dataUrl) return;
  const format = dataUrl.includes("image/png") ? "PNG" : dataUrl.includes("image/webp") ? "WEBP" : "JPEG";
  try {
    doc.addImage(dataUrl, format, x, y, width, height);
  } catch {
    // The archive remains valid if a remote logo cannot be embedded.
  }
}

async function downloadClassHistoryPdf(record: StudentClassHistoryRecord, context: {
  studentName: string;
  matricule?: string;
  admissionNumber?: string;
  schoolName?: string;
  schoolLogo?: string;
  currentClass?: string;
  filename: string;
}) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableModule as any).default ?? autoTableModule;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = "#1a3c6e";
  const logo = await loadHistoryPdfImage(context.schoolLogo);

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(28, 24, pageWidth - 56, pageHeight - 48, 6, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor("#111827");
  doc.text("REPUBLIC OF CAMEROON", 44, 48);
  doc.setFont("helvetica", "normal");
  doc.text("Peace - Work - Fatherland", 44, 60);
  doc.text("Ministry of Secondary Education", 44, 72);
  doc.setFont("helvetica", "bold");
  doc.text("REPUBLIQUE DU CAMEROUN", pageWidth - 44, 48, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text("Paix - Travail - Patrie", pageWidth - 44, 60, { align: "right" });
  doc.text("Enseignement Secondaire", pageWidth - 44, 72, { align: "right" });
  addHistoryPdfImage(doc, logo, pageWidth / 2 - 22, 42, 44, 44);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(primary);
  doc.text(context.schoolName || "School", pageWidth / 2, 108, { align: "center" });
  doc.setFontSize(14);
  doc.text("PREVIOUS CLASS ACADEMIC ARCHIVE", pageWidth / 2, 132, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#64748b");
  doc.text("School-issued historical record kept separate from the student's current class dashboard.", pageWidth / 2, 146, { align: "center" });
  doc.setDrawColor(primary);
  doc.setLineWidth(1);
  doc.line(44, 158, pageWidth - 44, 158);

  autoTable(doc, {
    startY: 174,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    body: [
      ["Student", context.studentName, "Matricule", context.matricule || "-"],
      ["Admission No.", context.admissionNumber || "-", "Current Class", context.currentClass || "-"],
      ["Archived Class", record.class_name, "Academic Year", record.academic_year],
      ["Sub-school", record.sub_school_name || "Main School", "Decision", record.status],
    ],
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 12,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, halign: "center" },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    head: [["Annual Average", "Promotion Average", "Attendance", "Published Reports"]],
    body: [[
      formatAverage(record.annual_average),
      formatAverage(record.promotion_average),
      `${record.attendance.attendance_percentage.toFixed(1)}%`,
      String(record.report_cards.filter((card) => card.published).length),
    ]],
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 12,
    head: [["Term", "Average /20", "Rank", "Report Status"]],
    body: record.terms.length
      ? record.terms.map((term) => [
          term.label || `Term ${term.term}`,
          formatAverage(term.average),
          term.rank ? `${term.rank}/${term.total_students || "-"}` : "-",
          term.published ? "Published" : "Not published",
        ])
      : [["No term records found", "-", "-", "-"]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 12,
    head: [["Subject", "Code", "Teacher", "Coef.", "Average /20", "Recorded Scores"]],
    body: record.subjects.length
      ? record.subjects.map((subject) => [
          subject.subject_name,
          subject.subject_code || "-",
          subject.teacher_name || "-",
          String(subject.coefficient ?? "-"),
          formatAverage(subject.average),
          (subject.scores || []).map((score) => `${score.sequence_name}: ${score.score.toFixed(2)}`).join("; ") || "-",
        ])
      : [["No subject records found", "-", "-", "-", "-", "-"]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 94 }, 2: { cellWidth: 82 }, 5: { cellWidth: 128 } },
    didDrawPage: (data: any) => {
      doc.setFontSize(7);
      doc.setTextColor("#64748b");
      doc.text("Issued by the school from EduIgnite archived academic records.", pageWidth / 2, pageHeight - 22, { align: "center" });
      doc.text(`Page ${data.pageNumber}`, pageWidth - 44, pageHeight - 22, { align: "right" });
    },
  });

  const finalY = Math.min((doc as any).lastAutoTable.finalY + 28, pageHeight - 68);
  doc.setDrawColor("#94a3b8");
  doc.line(58, finalY, 170, finalY);
  doc.line(pageWidth - 170, finalY, pageWidth - 58, finalY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(primary);
  doc.text("Registrar", 114, finalY + 12, { align: "center" });
  doc.text("Principal / School Seal", pageWidth - 114, finalY + 12, { align: "center" });

  doc.save(context.filename);
}

function SubjectList({ subjects }: { subjects: StudentClassHistorySubject[] }) {
  if (!subjects.length) {
    return <p className="text-sm text-muted-foreground">No subjects are currently assigned to this class yet.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {subjects.map((subject) => (
        <div key={`${subject.subject_id}-${subject.type || "subject"}`} className="rounded-xl border bg-white p-3">
          <p className="font-bold text-primary">{subject.subject_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {subject.teacher_name ? `${subject.teacher_name} - ` : ""}{subject.type || "Subject"}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function ClassHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isStudent = user?.role === "STUDENT";
  const historyQuery = useMyClassHistory(isStudent);
  const schoolLogo = resolveMediaUrl(user?.school?.logo);
  const data = historyQuery.data;
  const history = data?.history || [];

  const totals = useMemo(() => {
    const totalClasses = history.length;
    const reportCards = history.reduce((sum, record) => sum + record.report_cards.filter((card) => card.published).length, 0);
    const average = history.length
      ? history.reduce((sum, record) => sum + asNumber(record.annual_average), 0) / history.length
      : 0;
    return { totalClasses, reportCards, average };
  }, [history]);

  const handleDownload = async (record: StudentClassHistoryRecord) => {
    if (!data) return;
    await downloadClassHistoryPdf(record, {
      studentName: data.student.name,
      matricule: data.student.matricule,
      admissionNumber: data.student.admission_number,
      schoolName: user?.school?.name,
      schoolLogo,
      currentClass: data.current_class.name,
      filename: `${safeFilenameToken(`${record.class_name}-${record.academic_year}-archive`)}.pdf`,
    });
    toast({ title: "Archive downloaded", description: `${record.class_name} ${record.academic_year} was prepared as a PDF.` });
  };

  if (!isStudent) {
    return (
      <div className="space-y-6 pb-20">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Student archive only</AlertTitle>
          <AlertDescription>This section is available inside a student account.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (historyQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (historyQuery.isError) {
    return (
      <div className="space-y-6 pb-20">
        <Alert variant="destructive">
          <Archive className="h-4 w-4" />
          <AlertTitle>Could not load previous classes</AlertTitle>
          <AlertDescription>Refresh the page. If this continues, ask your school admin to confirm your promotion record.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-lg">
              <Archive className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-headline text-3xl font-black uppercase tracking-tight text-primary">Previous Class Records</h1>
              <p className="text-sm text-muted-foreground">Your archived report cards, transcript summary, and attendance from classes already completed.</p>
            </div>
          </div>
        </div>
        <Badge className="w-fit rounded-full bg-primary/10 px-4 py-2 text-primary hover:bg-primary/10">
          Current class: {data?.current_class.name || "Not assigned"}
        </Badge>
      </div>

      <Card className="border-none bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <GraduationCap className="h-5 w-5" />
            Current Class Focus
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Class", data?.current_class.name || "-"],
              ["Sub-school", data?.current_class.sub_school_name || "Main School"],
              ["Academic Year", data?.current_class.academic_year || "-"],
              ["Section", data?.current_class.section || "-"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 font-black text-primary">{value}</p>
              </div>
            ))}
          </div>
          <Alert className="border-primary/20 bg-primary/5">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Current class data is separated</AlertTitle>
            <AlertDescription>
              Your normal dashboard tabs now focus on this current class and current academic year. Previous class records stay here for review and download.
            </AlertDescription>
          </Alert>
          <SubjectList subjects={data?.current_class.subjects || []} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-none bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">Archived Classes</p>
            <p className="mt-2 text-3xl font-black text-primary">{totals.totalClasses}</p>
          </CardContent>
        </Card>
        <Card className="border-none bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">Published Report Cards</p>
            <p className="mt-2 text-3xl font-black text-primary">{totals.reportCards}</p>
          </CardContent>
        </Card>
        <Card className="border-none bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">Archive Average</p>
            <p className="mt-2 text-3xl font-black text-primary">{totals.average ? totals.average.toFixed(2) : "0.00"}/20</p>
          </CardContent>
        </Card>
      </div>

      {!history.length ? (
        <Card className="border-dashed bg-white shadow-sm">
          <CardContent className="p-10 text-center">
            <Archive className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-black text-primary">No previous class records yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Once your school admin promotes you to the next class, your completed class statistics will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {history.map((record) => (
            <Card key={record.id} className="overflow-hidden border-none bg-white shadow-sm">
              <CardHeader className="border-b bg-muted/30">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-xl text-primary">{record.class_name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {record.sub_school_name || "Main School"} - {record.academic_year}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusBadgeClass(record.status)}>{record.status}</Badge>
                    <Button variant="outline" className="gap-2 rounded-xl" onClick={() => handleDownload(record)}>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-5">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Annual Average</p>
                    <p className="mt-1 text-2xl font-black text-primary">{formatAverage(record.annual_average)}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Attendance</p>
                    <p className="mt-1 text-2xl font-black text-primary">{record.attendance.attendance_percentage.toFixed(1)}%</p>
                    <Progress value={record.attendance.attendance_percentage} className="mt-3 h-2" />
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Subjects</p>
                    <p className="mt-1 text-2xl font-black text-primary">{record.subjects.length}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Promoted To</p>
                    <p className="mt-1 text-lg font-black text-primary">{record.promoted_to_class_name || "School review"}</p>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border">
                    <div className="flex items-center gap-2 border-b p-4">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      <h3 className="font-black text-primary">Term Results</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Term</TableHead>
                            <TableHead>Average</TableHead>
                            <TableHead>Rank</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {record.terms.length ? record.terms.map((term) => (
                            <TableRow key={`${record.id}-${term.term}`}>
                              <TableCell className="font-bold">{term.label || `Term ${term.term}`}</TableCell>
                              <TableCell>{formatAverage(term.average)}</TableCell>
                              <TableCell>{term.rank ? `${term.rank}/${term.total_students || "-"}` : "-"}</TableCell>
                              <TableCell>{term.published ? <Badge>Published</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
                            </TableRow>
                          )) : (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No term records found.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="rounded-2xl border">
                    <div className="flex items-center gap-2 border-b p-4">
                      <Award className="h-4 w-4 text-primary" />
                      <h3 className="font-black text-primary">Attendance Summary</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-4">
                      {[
                        ["Present", record.attendance.present],
                        ["Late", record.attendance.late],
                        ["Absent", record.attendance.absent],
                        ["Excused", record.attendance.excused],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
                          <p className="mt-1 text-2xl font-black text-primary">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border">
                  <div className="flex items-center gap-2 border-b p-4">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <h3 className="font-black text-primary">Subject Transcript</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Teacher</TableHead>
                          <TableHead>Coef.</TableHead>
                          <TableHead>Average</TableHead>
                          <TableHead>Scores</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {record.subjects.length ? record.subjects.map((subject) => (
                          <TableRow key={`${record.id}-${subject.subject_id}`}>
                            <TableCell className="font-bold">{subject.subject_name}</TableCell>
                            <TableCell>{subject.teacher_name || "-"}</TableCell>
                            <TableCell>{subject.coefficient ?? "-"}</TableCell>
                            <TableCell>{formatAverage(subject.average)}</TableCell>
                            <TableCell className="min-w-48">
                              <div className="flex flex-wrap gap-1">
                                {(subject.scores || []).map((score) => (
                                  <Badge key={`${subject.subject_id}-${score.sequence_id}`} variant="outline">
                                    {score.sequence_name}: {score.score.toFixed(2)}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )) : (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No subject records found.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="rounded-2xl border">
                  <div className="flex items-center gap-2 border-b p-4">
                    <FileBadge className="h-4 w-4 text-primary" />
                    <h3 className="font-black text-primary">Report Cards</h3>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {record.report_cards.length ? record.report_cards.map((card) => (
                      <div key={`${record.id}-${card.scope}-${card.sequence_id || card.term}`} className="rounded-xl border bg-white p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-primary">{card.title || card.sequence_name || "Report Card"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{card.scope} - {card.academic_year}</p>
                          </div>
                          {card.published ? <Badge className="bg-green-600">Published</Badge> : <Badge variant="outline">Not published</Badge>}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No report cards are available for this class yet.</div>
                    )}
                  </div>
                </div>

                {record.decision_reason ? (
                  <Alert>
                    <Users className="h-4 w-4" />
                    <AlertTitle>Promotion Decision</AlertTitle>
                    <AlertDescription>{record.decision_reason}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
