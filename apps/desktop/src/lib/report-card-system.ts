/**
 * Report Card & Transcript Management System
 * MINESEC-compliant academic reporting for Cameroon Secondary Schools
 */

export interface SubjectGrade {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  score: number; // 0-20 scale
  grade: "A" | "B" | "C" | "D" | "E" | "F";
  gradePoint: number; // 4.0 scale equivalent
  credit: number;
  teacher?: string;
  comment?: string;
  sequence?: string; // Sequence 1, 2, 3, etc.
  term?: string; // Term 1, 2, 3
}

export interface AcademicTerm {
  id: string;
  name: string; // "Term 1", "Term 2", "Term 3"
  startDate: Date;
  endDate: Date;
  academicYear: string; // "2023/2024"
}

export interface StudentAcademicRecord {
  studentId: string;
  studentName: string;
  matricule: string;
  classLevel: string; // "Form 1", "Form 2", etc.
  section: string; // "Anglophone", "Francophone", "Technical"
  dateOfBirth?: Date;
  avatar?: string;
  
  // Academic performance
  subjectGrades: SubjectGrade[];
  term: AcademicTerm;
  
  // Aggregated metrics
  totalScore: number; // Sum of all subject scores
  averageScore: number; // Average across all subjects
  gpa: number; // Grade Point Average (4.0 scale)
  ranking?: number; // Class ranking
  classSize?: number;
  
  // Attendance
  attendancePercentage?: number;
  daysAbsent?: number;
  daysPresent?: number;
  
  // Behavioral assessment
  conduct?: "Excellent" | "Good" | "Satisfactory" | "Needs Improvement" | "Poor";
  participation?: "Active" | "Moderate" | "Passive";
  
  // Remarks
  teacherRemarks?: string;
  principalRemarks?: string;
  
  // Status
  promoted?: boolean;
  onHonourRoll?: boolean;
  needsAcademicSupport?: boolean;
}

export interface ReportCardTemplate {
  id: string;
  name: string;
  schoolId: string;
  includeAttendance: boolean;
  includeConduct: boolean;
  includeTeacherRemarks: boolean;
  includePrincipalRemarks: boolean;
  includeRanking: boolean;
  includeGPA: boolean;
  honorRollThreshold: number; // GPA threshold for honour roll
  academicSupportThreshold: number; // GPA threshold for academic support
}

export interface TranscriptDocument {
  id: string;
  studentId: string;
  documentType: "transcript" | "report-card" | "certificate";
  issuedDate: Date;
  issuedBy: string; // User ID
  schoolName: string;
  schoolLogo?: string;
  principal?: string;
  principalSignature?: string;
  schoolSeal?: string;
  
  // Document security
  documentNumber: string; // Unique document identifier
  qrCode?: string; // Encoded document verification link
  barcode?: string;
  digitallySigned: boolean;
  signatureTimestamp?: Date;
  
  // Content
  academicRecord: StudentAcademicRecord;
  
  // Metadata
  archived: boolean;
  archivedDate?: Date;
  expiryDate?: Date;
  verificationUrl?: string;
}

// ============================================================================
// GRADING SCALE - MINESEC STANDARD (0-20)
// ============================================================================

export const MINESEC_GRADING_SCALE = {
  A: { min: 18, max: 20, label: "Excellent", gpa: 4.0 },
  B: { min: 16, max: 17.99, label: "Very Good", gpa: 3.5 },
  C: { min: 14, max: 15.99, label: "Good", gpa: 3.0 },
  D: { min: 12, max: 13.99, label: "Satisfactory", gpa: 2.5 },
  E: { min: 10, max: 11.99, label: "Pass", gpa: 2.0 },
  F: { min: 0, max: 9.99, label: "Fail", gpa: 0.0 },
};

export const CONDUCT_SCALE = [
  "Excellent",
  "Good",
  "Satisfactory",
  "Needs Improvement",
  "Poor",
];

export const PARTICIPATION_SCALE = [
  "Active",
  "Moderate",
  "Passive",
];

// ============================================================================
// REPORT CARD CALCULATION FUNCTIONS
// ============================================================================

export function calculateGrade(score: number): "A" | "B" | "C" | "D" | "E" | "F" {
  if (score >= 18) return "A";
  if (score >= 16) return "B";
  if (score >= 14) return "C";
  if (score >= 12) return "D";
  if (score >= 10) return "E";
  return "F";
}

export function calculateGPA(score: number): number {
  const grade = calculateGrade(score);
  return MINESEC_GRADING_SCALE[grade].gpa;
}

export function calculateAverageScore(grades: SubjectGrade[]): number {
  if (grades.length === 0) return 0;
  const total = grades.reduce((sum, g) => sum + g.score, 0);
  return Math.round((total / grades.length) * 100) / 100;
}

export function calculateGPA_Overall(grades: SubjectGrade[]): number {
  if (grades.length === 0) return 0;
  const totalGPA = grades.reduce((sum, g) => sum + g.gradePoint, 0);
  return Math.round((totalGPA / grades.length) * 100) / 100;
}

export function calculateTotalScore(grades: SubjectGrade[]): number {
  return grades.reduce((sum, g) => sum + g.score, 0);
}

export function isOnHonorRoll(gpa: number, threshold: number = 3.5): boolean {
  return gpa >= threshold;
}

export function needsAcademicSupport(gpa: number, threshold: number = 2.0): boolean {
  return gpa < threshold;
}

export function determinePromotion(gpa: number, failedSubjects: number): boolean {
  // MINESEC standard: Promoted if GPA >= 2.0 and no more than 2 failed subjects
  return gpa >= 2.0 && failedSubjects <= 2;
}

// ============================================================================
// REPORT CARD GENERATION
// ============================================================================

export function generateReportCard(
  studentRecord: StudentAcademicRecord,
  template: ReportCardTemplate
): TranscriptDocument {
  const documentNumber = `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const verificationCode = Buffer.from(documentNumber).toString("base64");

  return {
    id: `REPORT-${Date.now()}`,
    studentId: studentRecord.studentId,
    documentType: "report-card",
    issuedDate: new Date(),
    issuedBy: "admin@school.edu",
    schoolName: "Government Bilingual High School Deido",
    digitallySigned: true,
    signatureTimestamp: new Date(),
    
    documentNumber,
    qrCode: `https://verify.eduignite.edu/doc/${verificationCode}`,
    barcode: documentNumber,
    
    academicRecord: studentRecord,
    
    archived: false,
    expiryDate: new Date(new Date().getFullYear() + 5, 11, 31),
    verificationUrl: `https://verify.eduignite.edu/transcript/${documentNumber}`,
  };
}

export function generateTranscript(
  studentRecord: StudentAcademicRecord,
  allTermRecords: StudentAcademicRecord[],
  template: ReportCardTemplate
): TranscriptDocument {
  const documentNumber = `TRN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const verificationCode = Buffer.from(documentNumber).toString("base64");

  return {
    id: `TRANSCRIPT-${Date.now()}`,
    studentId: studentRecord.studentId,
    documentType: "transcript",
    issuedDate: new Date(),
    issuedBy: "admin@school.edu",
    schoolName: "Government Bilingual High School Deido",
    digitallySigned: true,
    signatureTimestamp: new Date(),
    
    documentNumber,
    qrCode: `https://verify.eduignite.edu/doc/${verificationCode}`,
    barcode: documentNumber,
    
    academicRecord: studentRecord,
    
    archived: false,
    expiryDate: new Date(new Date().getFullYear() + 10, 11, 31),
    verificationUrl: `https://verify.eduignite.edu/transcript/${documentNumber}`,
  };
}

// ============================================================================
// TRANSCRIPT VERIFICATION
// ============================================================================

export async function verifyTranscriptIntegrity(
  document: TranscriptDocument
): Promise<{
  valid: boolean;
  tampered: boolean;
  expired: boolean;
  reason?: string;
}> {
  try {
    // Check expiry
    if (document.expiryDate && new Date() > document.expiryDate) {
      return {
        valid: false,
        tampered: false,
        expired: true,
        reason: "Document has expired",
      };
    }

    // Check digital signature
    if (!document.digitallySigned) {
      return {
        valid: false,
        tampered: true,
        expired: false,
        reason: "Document is not digitally signed",
      };
    }

    // In production, verify cryptographic signature
    return {
      valid: true,
      tampered: false,
      expired: false,
    };
  } catch (error) {
    return {
      valid: false,
      tampered: true,
      expired: false,
      reason: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

// ============================================================================
// BULK REPORT CARD GENERATION
// ============================================================================

export function generateBulkReportCards(
  studentRecords: StudentAcademicRecord[],
  template: ReportCardTemplate
): TranscriptDocument[] {
  return studentRecords.map(record => generateReportCard(record, template));
}

export function generateBulkTranscripts(
  studentRecords: StudentAcademicRecord[],
  allTermRecords: Map<string, StudentAcademicRecord[]>,
  template: ReportCardTemplate
): TranscriptDocument[] {
  return studentRecords.map(record => {
    const allRecords = allTermRecords.get(record.studentId) || [record];
    return generateTranscript(record, allRecords, template);
  });
}

// ============================================================================
// REPORT CARD EXPORT FUNCTIONS
// ============================================================================

export function exportReportCardAsHTML(document: TranscriptDocument): string {
  const record = document.academicRecord;
  const failedSubjects = record.subjectGrades.filter(g => g.grade === "F").length;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Report Card - ${record.studentName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 3px solid #0066cc; padding-bottom: 20px; margin-bottom: 20px; }
        .header h1 { color: #0066cc; font-size: 24px; margin-bottom: 5px; }
        .header p { color: #666; font-size: 14px; }
        .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .info-box { background: #f5f5f5; padding: 15px; border-radius: 8px; }
        .info-label { font-weight: bold; color: #0066cc; font-size: 12px; text-transform: uppercase; }
        .info-value { font-size: 16px; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #0066cc; color: white; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
        td { padding: 12px; border-bottom: 1px solid #ddd; }
        tr:hover { background: #f9f9f9; }
        .grade-a { color: #22c55e; font-weight: bold; }
        .grade-f { color: #ef4444; font-weight: bold; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
        .summary-item { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
        .summary-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
        .summary-value { font-size: 24px; font-weight: bold; color: #0066cc; }
        .remarks { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .remarks-title { font-weight: bold; color: #0066cc; margin-bottom: 10px; }
        .footer { text-align: center; border-top: 1px solid #ddd; padding-top: 20px; font-size: 12px; color: #666; }
        .document-number { color: #0066cc; font-weight: bold; }
        @media print { body { margin: 0; padding: 0; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${document.schoolName}</h1>
          <p>Official Academic Report Card</p>
          <p style="font-size: 12px; color: #999;">Document: <span class="document-number">${document.documentNumber}</span></p>
        </div>

        <div class="student-info">
          <div class="info-box">
            <div class="info-label">Student Name</div>
            <div class="info-value">${record.studentName}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Matricule</div>
            <div class="info-value">${record.matricule}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Class Level</div>
            <div class="info-value">${record.classLevel}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Section</div>
            <div class="info-value">${record.section}</div>
          </div>
        </div>

        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">Average Score</div>
            <div class="summary-value">${record.averageScore.toFixed(2)}/20</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">GPA</div>
            <div class="summary-value">${record.gpa.toFixed(2)}/4.0</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Class Ranking</div>
            <div class="summary-value">${record.ranking || "N/A"}/${record.classSize || "N/A"}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Status</div>
            <div class="summary-value">${record.onHonourRoll ? "Honour Roll" : record.needsAcademicSupport ? "Support" : "Good"}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Code</th>
              <th>Score</th>
              <th>Grade</th>
              <th>Teacher</th>
            </tr>
          </thead>
          <tbody>
            ${record.subjectGrades.map(grade => `
              <tr>
                <td>${grade.subjectName}</td>
                <td>${grade.subjectCode}</td>
                <td>${grade.score}/20</td>
                <td class="${grade.grade === "A" ? "grade-a" : grade.grade === "F" ? "grade-f" : ""}">${grade.grade}</td>
                <td>${grade.teacher || "N/A"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        ${record.teacherRemarks ? `
          <div class="remarks">
            <div class="remarks-title">Teacher's Remarks</div>
            <p>${record.teacherRemarks}</p>
          </div>
        ` : ""}

        ${record.principalRemarks ? `
          <div class="remarks">
            <div class="remarks-title">Principal's Remarks</div>
            <p>${record.principalRemarks}</p>
          </div>
        ` : ""}

        <div class="footer">
          <p>This is an official academic record issued by ${document.schoolName}</p>
          <p>Issued: ${document.issuedDate.toLocaleDateString()}</p>
          <p>Verification: ${document.verificationUrl}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export default {
  MINESEC_GRADING_SCALE,
  CONDUCT_SCALE,
  PARTICIPATION_SCALE,
  calculateGrade,
  calculateGPA,
  calculateAverageScore,
  calculateGPA_Overall,
  calculateTotalScore,
  isOnHonorRoll,
  needsAcademicSupport,
  determinePromotion,
  generateReportCard,
  generateTranscript,
  verifyTranscriptIntegrity,
  generateBulkReportCards,
  generateBulkTranscripts,
  exportReportCardAsHTML,
};
