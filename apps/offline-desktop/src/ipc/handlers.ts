import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import type Database from 'better-sqlite3-multiple-ciphers';

import { createBackup, restoreBackup } from '../backup/backupService';
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
import { login, logout, getCurrentSession } from '../auth/session';
import { requireRole } from './rbac';
import { pingBackend, searchSchools } from '../setup/setupClient';
import { confirmSchoolShell, createFirstAdmin, completeSetup } from '../setup/setupService';
import {
  createNode,
  deleteNode,
  getTree,
  listNodes,
  moveNode,
  updateNode,
} from '../repositories/structureRepository';
import {
  createNotice,
  listAllNotices,
  listPublishedNotices,
  setNoticePublished,
} from '../repositories/noticeRepository';

export interface IpcPaths {
  reportsDir: string;
  receiptsDir: string;
  /** Path to the encrypted SQLite file itself (see src/db/connection.ts). */
  dbPath: string;
  /** Path to the sibling hex-encoded key file (see src/db/encryption.ts). */
  keyFilePath: string;
  /** Versioned `NNNN_*.sql` migrations directory, applied on every openDatabase() call. */
  migrationsDir: string;
  /** Default folder suggested by the backup/restore file dialogs. */
  backupsDir: string;
}

/**
 * Registers every `ipcMain.handle` channel the preload bridge (electron/preload.ts)
 * invokes. One function, called once at app startup with the already-open DB
 * handle — see electron/main.ts. Channel names are `<namespace>:<action>` and
 * must stay in sync with src/shared/api.ts (the renderer-facing type contract).
 */
export function registerIpcHandlers(db: Database.Database, paths: IpcPaths): void {
  // `db` is intentionally reassignable (not destructured into a `const`):
  // backup:restore replaces the live database file out from under the app
  // and must swap every handler in this file over to a fresh connection on
  // the restored file. Every handler below closes over this same `db`
  // binding by reference, so reassigning it once here is visible to all of
  // them on their next invocation -- see backup:restore further down.
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

  // -- Auth / session (Phase A #3) ---------------------------------------------
  // Login/logout are never gated by registerWrite's license check -- a
  // read-only (expired) installation must still let its staff log in to see
  // their (fully readable) historical data. Session lives in main-process
  // memory only (src/auth/session.ts) -- nothing is persisted or handed back
  // to the renderer except the safe SessionUser shape.
  ipcMain.handle('auth:login', (_e, emailOrUsername: string, password: string) =>
    login(db, emailOrUsername, password)
  );
  ipcMain.handle('auth:logout', () => logout());
  ipcMain.handle('auth:currentSession', () => getCurrentSession());

  // -- Setup wizard (Phase A #4) ------------------------------------------------
  // Steps 1-2 need the network (setupClient.ts); steps 2-5's actual writes
  // are local-only (setupService.ts). None of this requires a session --
  // nobody can be logged in yet before Step 4 creates the first account --
  // but the writes still go through registerWrite so a somehow-already-
  // read-only installation (e.g. re-running setup after a factory reset)
  // can't silently corrupt itself.
  ipcMain.handle('setup:ping', () => pingBackend());
  ipcMain.handle('setup:searchSchools', (_e, query: string) => searchSchools(query));
  registerWrite('setup:confirmSchool', (_e, input) => confirmSchoolShell(db, input));
  registerWrite('setup:createFirstAdmin', (_e, input) => createFirstAdmin(db, input));
  registerWrite('setup:completeSetup', () => completeSetup(db));

  // -- Structure tree (Phase A #2/#3) -------------------------------------------
  // Reads are open to any authenticated session (every role needs to render
  // the tree somewhere -- e.g. a teacher's own subject/class picker walks
  // the same nodes); edits require SCHOOL_ADMIN, composing requireRole
  // (innermost) with registerWrite (outermost) per src/ipc/rbac.ts's header
  // comment.
  ipcMain.handle('structure:list', (_e, schoolId: string) => listNodes(db, schoolId));
  ipcMain.handle('structure:tree', (_e, schoolId: string) => getTree(db, schoolId));
  registerWrite('structure:create', requireRole(['SCHOOL_ADMIN'])((_e, input) => createNode(db, input)));
  registerWrite(
    'structure:update',
    requireRole(['SCHOOL_ADMIN'])((_e, id: string, input) => updateNode(db, id, input))
  );
  registerWrite(
    'structure:move',
    requireRole(['SCHOOL_ADMIN'])((_e, id: string, newParentId: string | null) => moveNode(db, id, newParentId))
  );
  registerWrite('structure:delete', requireRole(['SCHOOL_ADMIN'])((_e, id: string) => deleteNode(db, id)));

  // -- Notices / login-screen notice board (Phase A #2/#3) ----------------------
  // listPublished is deliberately reachable with NO auth at all -- the login
  // screen itself renders it before anyone has signed in. listAll (includes
  // unpublished drafts) and every write require SCHOOL_ADMIN.
  ipcMain.handle('notices:listPublished', (_e, schoolId: string) => listPublishedNotices(db, schoolId));
  ipcMain.handle(
    'notices:listAll',
    requireRole(['SCHOOL_ADMIN'])((_e, schoolId: string) => listAllNotices(db, schoolId))
  );
  registerWrite('notices:create', requireRole(['SCHOOL_ADMIN'])((_e, input) => createNotice(db, input)));
  registerWrite(
    'notices:setPublished',
    requireRole(['SCHOOL_ADMIN'])((_e, id: string, isPublished: boolean) =>
      setNoticePublished(db, id, isPublished)
    )
  );

  // -- Backup / Restore ----------------------------------------------------------
  // Brand new feature -- nothing like this existed before (see src/backup/backupService.ts
  // for the archive format + validate-before-touch-anything-live restore flow).
  // Both channels prompt the admin for a save/open location with Electron's
  // native file dialog, called here in the main process (never exposed to
  // the renderer directly, so contextIsolation is untouched) -- there was no
  // pre-existing dialog usage anywhere in this app to mirror (reportCards/finance
  // PDF export instead just write into a fixed app-managed folder and hand
  // back the path), but backup/restore genuinely need an admin-chosen
  // location (e.g. a USB drive) so a native dialog is unavoidable here.
  // Gated to SCHOOL_ADMIN specifically via requireRole (src/ipc/rbac.ts),
  // same precedent as structure:create/notices:create just above -- restore
  // additionally goes through registerWrite since it is the most
  // consequential write in the whole app (replaces the entire database).
  registerWrite(
    'backup:create',
    requireRole(['SCHOOL_ADMIN'])(async (event, passphrase: string) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const school = getSchool(db);
      const slug = (school?.short_name || school?.name || 'eduignite').replace(/[^a-z0-9-_]+/gi, '-');
      const defaultName = `${slug}-backup-${new Date().toISOString().slice(0, 10)}.eibackup`;
      const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined as any, {
        title: 'Save Backup',
        defaultPath: path.join(paths.backupsDir, defaultName),
        filters: [{ name: 'EduIgnite Backup', extensions: ['eibackup'] }],
      });
      if (canceled || !filePath) return { canceled: true as const };
      const result = createBackup(db, { keyFilePath: paths.keyFilePath, outputPath: filePath, passphrase });
      return { canceled: false as const, ...result };
    })
  );
  registerWrite(
    'backup:restore',
    requireRole(['SCHOOL_ADMIN'])(async (event, passphrase: string) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined as any, {
        title: 'Restore From Backup File',
        defaultPath: paths.backupsDir,
        filters: [{ name: 'EduIgnite Backup', extensions: ['eibackup'] }],
        properties: ['openFile'],
      });
      if (canceled || !filePaths[0]) return { canceled: true as const };
      const result = restoreBackup({
        currentDb: db,
        archivePath: filePaths[0],
        passphrase,
        dbPath: paths.dbPath,
        keyFilePath: paths.keyFilePath,
        migrationsDir: paths.migrationsDir,
      });
      // See the comment on registerIpcHandlers' `db` parameter above -- this
      // reassignment is what makes every other handler in this file start
      // using the restored connection on their very next call.
      db = result.db;
      // The in-memory session (src/auth/session.ts) references a user row
      // that may not exist (or may mean someone else) in the restored
      // database -- force a fresh login against the restored data instead
      // of leaving a stale session active.
      logout();
      return { canceled: false as const, schoolName: result.schoolName, restoredAt: result.restoredAt };
    })
  );

  // -- Shell -------------------------------------------------------------------
  // Opens a URL (e.g. an update download link) in the OS's default browser
  // instead of navigating the app's own BrowserWindow away from itself.
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    return shell.openExternal(url);
  });
}
