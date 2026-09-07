import { ipcMain, shell } from 'electron';
import path from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';

import { checkLicenseGate, installCertificate } from '../licensing/gate';
import { getDeviceId } from '../licensing/fingerprint';
import { generateChallenge } from '../licensing/challenge';
import type { ChallengePurpose, ChallengeRedeemResponse } from '../licensing/types';
import { runSync } from '../sync/syncClient';
import { getSchool, upsertSchool } from '../repositories/schoolRepository';
import {
  createTeacher,
  listTeachers,
  setTeacherActive,
  updateTeacher,
} from '../repositories/teacherRepository';
import {
  countEnrollmentByStream,
  createClass,
  createStream,
  listClasses,
  listStreams,
  updateStream,
} from '../repositories/classRepository';
import {
  assignSubjectToStream,
  createSubject,
  listAssignmentsForStream,
  listSubjects,
  updateAssignment,
} from '../repositories/subjectRepository';
import {
  createStudent,
  getStudent,
  listPromotionsForStudent,
  listStudents,
  promoteClassStream,
  updateStudent,
} from '../repositories/studentRepository';
import { listHistory, rateReportForStream, recordDay } from '../repositories/attendanceRepository';
import {
  listCatsForStudentTerm,
  listExamsForStudentTerm,
  recordCat,
  recordExam,
} from '../repositories/academicsRepository';
import {
  compileReportCard,
  compileReportCardsForStream,
  getReportCard,
  listReportCards,
  setReportCardPdfPath,
} from '../repositories/reportCardRepository';
import {
  collectionsReport,
  createFeeTemplate,
  getPayment,
  getStudentBalance,
  listFeeTemplates,
  listPaymentsForStudent,
  listTransactions,
  recordPayment,
} from '../repositories/financeRepository';
import { buildReportCardDocDefinition } from '../pdf/reportCardPdf';
import { buildReceiptDocDefinition } from '../pdf/receiptPdf';
import { renderPdfToFile } from '../pdf/printer';

export interface IpcPaths {
  reportsDir: string;
  receiptsDir: string;
}

/**
 * Registers every `ipcMain.handle` channel the preload bridge (electron/preload.ts)
 * invokes. One function, called once at app startup with the already-open DB
 * handle — see electron/main.ts. Channel names are `<namespace>:<action>` and
 * must stay in sync with src/shared/api.ts (the renderer-facing type contract).
 */
export function registerIpcHandlers(db: Database.Database, paths: IpcPaths): void {
  // Every write/modify channel is registered through this wrapper instead of
  // a bare `ipcMain.handle` — it re-checks the licensing gate on every call
  // (a handful of cheap KV reads, not cached, so it reacts immediately to a
  // license installed/expiring mid-session) and rejects with a clear,
  // typed-safe error when the app is read-only. Read/list/report/PDF-export
  // handlers are registered directly with `ipcMain.handle` further down and
  // are never blocked — per spec section 4, historical data must remain
  // fully readable no matter the license state.
  function registerWrite(
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown
  ): void {
    ipcMain.handle(channel, (event, ...args: any[]) => {
      const gate = checkLicenseGate(db);
      if (gate.readOnly) {
        throw new Error(
          `read-only: license ${gate.status}. Your data is safe and fully readable, but write operations are ` +
            `blocked until the license is renewed. ${gate.message}`
        );
      }
      return handler(event, ...args);
    });
  }

  // -- School -----------------------------------------------------------
  ipcMain.handle('school:get', () => getSchool(db));
  registerWrite('school:upsert', (_e, input) => upsertSchool(db, input));

  // -- Teachers -----------------------------------------------------------
  ipcMain.handle('teachers:list', (_e, schoolId: string) => listTeachers(db, schoolId));
  registerWrite('teachers:create', (_e, input) => createTeacher(db, input));
  registerWrite('teachers:update', (_e, id: string, input) => updateTeacher(db, id, input));
  registerWrite('teachers:setActive', (_e, id: string, isActive: boolean) =>
    setTeacherActive(db, id, isActive)
  );

  // -- Classes --------------------------------------------------------------
  ipcMain.handle('classes:list', (_e, schoolId: string) => listClasses(db, schoolId));
  registerWrite('classes:create', (_e, input) => createClass(db, input));
  ipcMain.handle('classes:listStreams', (_e, classId?: string) => listStreams(db, classId));
  registerWrite('classes:createStream', (_e, input) => createStream(db, input));
  registerWrite('classes:updateStream', (_e, id: string, input) => updateStream(db, id, input));
  ipcMain.handle('classes:countEnrollment', (_e, classStreamId: string) =>
    countEnrollmentByStream(db, classStreamId)
  );

  // -- Subjects ---------------------------------------------------------------
  ipcMain.handle('subjects:list', (_e, schoolId: string) => listSubjects(db, schoolId));
  registerWrite('subjects:create', (_e, input) => createSubject(db, input));
  ipcMain.handle('subjects:listForStream', (_e, classStreamId: string, academicYear: string) =>
    listAssignmentsForStream(db, classStreamId, academicYear)
  );
  registerWrite('subjects:assign', (_e, input) => assignSubjectToStream(db, input));
  registerWrite('subjects:updateAssignment', (_e, id: string, input) => updateAssignment(db, id, input));

  // -- Students -----------------------------------------------------------
  ipcMain.handle('students:list', (_e, filters) => listStudents(db, filters));
  ipcMain.handle('students:get', (_e, id: string) => getStudent(db, id));
  registerWrite('students:create', (_e, input) => createStudent(db, input));
  registerWrite('students:update', (_e, id: string, input) => updateStudent(db, id, input));
  ipcMain.handle('students:listPromotions', (_e, studentId: string) => listPromotionsForStudent(db, studentId));
  registerWrite('students:promoteClass', (_e, input) => promoteClassStream(db, input));

  // -- Attendance ---------------------------------------------------------
  registerWrite('attendance:recordDay', (_e, input) => recordDay(db, input));
  ipcMain.handle('attendance:history', (_e, filters) => listHistory(db, filters));
  ipcMain.handle('attendance:rateReport', (_e, classStreamId: string, term: string, academicYear: string) =>
    rateReportForStream(db, classStreamId, term, academicYear)
  );

  // -- Academics ------------------------------------------------------------
  registerWrite('academics:recordCat', (_e, input) => recordCat(db, input));
  registerWrite('academics:recordExam', (_e, input) => recordExam(db, input));
  ipcMain.handle(
    'academics:listForStudentTerm',
    (_e, studentId: string, term: string, academicYear: string) => ({
      cats: listCatsForStudentTerm(db, studentId, term, academicYear),
      exams: listExamsForStudentTerm(db, studentId, term, academicYear),
    })
  );

  // -- Report cards ---------------------------------------------------------
  // compile/compileForStream persist a new report_cards row (and bump each
  // student's annual_average), so they are gated like any other write.
  registerWrite('reportCards:compile', (_e, input) => compileReportCard(db, input));
  registerWrite(
    'reportCards:compileForStream',
    (_e, classStreamId: string, term: string, academicYear: string, promotionAverage?: number) =>
      compileReportCardsForStream(db, classStreamId, term, academicYear, promotionAverage)
  );
  ipcMain.handle('reportCards:list', (_e, filters) => listReportCards(db, filters));
  ipcMain.handle('reportCards:get', (_e, id: string) => getReportCard(db, id));
  // exportPdf only renders an already-compiled report card and caches its
  // output path — spec section 3/10 requires PDF export to keep working even
  // in read-only mode, so this stays ungated despite the small pdf_path write.
  ipcMain.handle('reportCards:exportPdf', async (_e, id: string) => {
    const reportCard = getReportCard(db, id);
    if (!reportCard) throw new Error(`Report card ${id} not found.`);
    const student = getStudent(db, reportCard.student_id);
    if (!student) throw new Error(`Student ${reportCard.student_id} not found.`);
    const school = getSchool(db);
    if (!school) throw new Error('School profile has not been configured yet.');

    const subjects = JSON.parse(reportCard.subjects_snapshot_json);
    const docDefinition = buildReportCardDocDefinition({ school, student, reportCard, subjects });
    const filePath = path.join(paths.reportsDir, `${reportCard.id}.pdf`);
    await renderPdfToFile(docDefinition, filePath);
    setReportCardPdfPath(db, id, filePath);
    return { pdfPath: filePath };
  });

  // -- Finance ----------------------------------------------------------------
  ipcMain.handle('finance:listFeeTemplates', (_e, schoolId: string, filters) =>
    listFeeTemplates(db, schoolId, filters ?? {})
  );
  registerWrite('finance:createFeeTemplate', (_e, input) => createFeeTemplate(db, input));
  registerWrite('finance:recordPayment', (_e, input) => {
    const school = getSchool(db);
    if (!school) throw new Error('School profile has not been configured yet.');
    return recordPayment(db, { ...input, schoolShortCode: school.short_name || school.id });
  });
  ipcMain.handle('finance:listPaymentsForStudent', (_e, studentId: string) =>
    listPaymentsForStudent(db, studentId)
  );
  ipcMain.handle('finance:getBalance', (_e, input) => getStudentBalance(db, input));
  ipcMain.handle('finance:listTransactions', (_e, filters) => listTransactions(db, filters));
  ipcMain.handle(
    'finance:collectionsReport',
    (_e, schoolId: string, term: string, academicYear: string) =>
      collectionsReport(db, schoolId, term, academicYear)
  );
  // Same rationale as reportCards:exportPdf — printing a receipt for an
  // already-recorded payment must keep working when read-only.
  ipcMain.handle('finance:exportReceiptPdf', async (_e, paymentId: string) => {
    const payment = getPayment(db, paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found.`);
    const student = getStudent(db, payment.student_id);
    if (!student) throw new Error(`Student ${payment.student_id} not found.`);
    const school = getSchool(db);
    if (!school) throw new Error('School profile has not been configured yet.');

    const docDefinition = buildReceiptDocDefinition({ school, student, payment });
    const filePath = path.join(paths.receiptsDir, `${payment.id}.pdf`);
    await renderPdfToFile(docDefinition, filePath);
    return { pdfPath: filePath };
  });

  // -- Licensing (spec sections 5, 6, 9) ---------------------------------------
  ipcMain.handle('license:check', () => checkLicenseGate(db));
  ipcMain.handle('licensing:getStatus', () => checkLicenseGate(db));
  ipcMain.handle('licensing:getDeviceInfo', () => ({
    deviceId: getDeviceId(db),
    schoolId: getSchool(db)?.id ?? null,
  }));
  // Challenge generation is read-only from the app's own perspective (it
  // doesn't mutate license_state), so it stays available even when the
  // license is expired — a school in read-only mode is exactly the school
  // that most needs to be able to generate a renewal challenge.
  ipcMain.handle(
    'licensing:generateChallenge',
    (_e, purpose: ChallengePurpose, previousDeviceId?: string) => {
      const school = getSchool(db);
      if (!school) throw new Error('School profile has not been configured yet.');
      return generateChallenge({
        schoolId: school.id,
        deviceId: getDeviceId(db),
        purpose,
        previousDeviceId,
      });
    }
  );
  // Installing a certificate is how a read-only installation gets itself
  // OUT of read-only mode, so this must never be blocked by the gate either.
  ipcMain.handle('licensing:installCertificateResponse', (_e, responseJson: string) => {
    let parsed: ChallengeRedeemResponse;
    try {
      parsed = JSON.parse(responseJson);
    } catch {
      throw new Error('Could not parse the scanned/pasted response as JSON.');
    }
    if (!parsed.certificate) {
      throw new Error('Response JSON did not contain a "certificate" field.');
    }
    return installCertificate(db, parsed.certificate);
  });

  // -- Sync (spec section 7) ---------------------------------------------------
  // Sync itself is never gated by the licensing read-only flag — a school
  // renewing via sync-adjacent connectivity, or simply backing up data while
  // expired, must still be able to push its (unmodified) local history.
  ipcMain.handle('sync:run', () => runSync(db));

  // -- Shell -------------------------------------------------------------------
  // Opens a URL (e.g. an update download link) in the OS's default browser
  // instead of navigating the app's own BrowserWindow away from itself.
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    return shell.openExternal(url);
  });
}
