import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { UpdateProvider } from './context/UpdateContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import UpdateRequiredNotice from './components/UpdateRequiredNotice';
import AppUpdateDialog from './components/AppUpdateDialog';
import SchoolProfilePage from './pages/SchoolProfilePage';
import SchoolHomePage from './pages/SchoolHomePage';
import NoticeBoardPage from './pages/NoticeBoardPage';
import ManageNoticesPage from './pages/ManageNoticesPage';
import HelpCenterPage from './pages/HelpCenterPage';
import StudentsPage from './pages/StudentsPage';
import StudentProfilePage from './pages/StudentProfilePage';
import TeachersPage from './pages/TeachersPage';
import ClassesPage from './pages/ClassesPage';
import SubjectsPage from './pages/SubjectsPage';
import AttendancePage from './pages/AttendancePage';
import AcademicRecordsPage from './pages/AcademicRecordsPage';
import ReportCardsPage from './pages/ReportCardsPage';
import FinancialsPage from './pages/FinancialsPage';
import Licensing from './pages/Licensing';
import StructureSettingsPage from './pages/StructureSettingsPage';
import StaffSettingsPage from './pages/StaffSettingsPage';
import BackupPage from './pages/BackupPage';
import LoginPage from './pages/LoginPage';
import SetupWizard from './pages/setup/SetupWizard';
import { canAccessSection, type AppSection } from './shared/roles';

export default function App() {
  return (
    <UpdateProvider>
      {/* Fixed full-viewport overlay when below minSupportedVersion — sits
          above everything else so it blocks the whole app, not just Layout's
          content column. Renders nothing otherwise. */}
      <UpdateRequiredNotice />
      {/* electron-updater-driven "a real update is available/downloading/
          ready" dialog -- separate concern from UpdateRequiredNotice above
          (a human-controlled hard floor). Renders nothing until the main
          process finds/downloads an update. See src/components/AppUpdateDialog.tsx. */}
      <AppUpdateDialog />
      <SchoolProvider>
        <AuthProvider>
          <AppGate />
        </AuthProvider>
      </SchoolProvider>
    </UpdateProvider>
  );
}

function FullScreenLoading() {
  return <div className="h-full w-full flex items-center justify-center text-muted-foreground">Loading…</div>;
}

/**
 * Top-level gate (Phase A #3/#4): setup-completion first, then
 * authentication, then role-based routing. Order matters -- an
 * unconfigured installation must show the wizard even before anyone could
 * possibly log in (there is no `users` row yet), and a configured-but-
 * logged-out installation must show the login screen instead of any app
 * content, no matter what route is in the address bar.
 */
function AppGate() {
  const { school, loading: schoolLoading } = useSchool();
  const { session, loading: authLoading } = useAuth();

  if (schoolLoading) return <FullScreenLoading />;
  if (!school || !school.setup_completed) return <SetupWizard />;
  if (authLoading) return <FullScreenLoading />;
  if (!session) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            <RequireSection section="schoolHome">
              <SchoolHomePage />
            </RequireSection>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireSection section="schoolProfile">
              <SchoolProfilePage />
            </RequireSection>
          }
        />
        <Route
          path="/notices"
          element={
            <RequireSection section="notices">
              <NoticeBoardPage />
            </RequireSection>
          }
        />
        <Route
          path="/notices/manage"
          element={
            <RequireSection section="noticesManage">
              <ManageNoticesPage />
            </RequireSection>
          }
        />
        <Route
          path="/help"
          element={
            <RequireSection section="help">
              <HelpCenterPage />
            </RequireSection>
          }
        />
        <Route
          path="/students"
          element={
            <RequireSection section="students">
              <StudentsPage />
            </RequireSection>
          }
        />
        <Route
          path="/students/:studentId"
          element={
            <RequireSection section="students">
              <StudentProfilePage />
            </RequireSection>
          }
        />
        <Route
          path="/teachers"
          element={
            <RequireSection section="teachers">
              <TeachersPage />
            </RequireSection>
          }
        />
        <Route
          path="/classes"
          element={
            <RequireSection section="classes">
              <ClassesPage />
            </RequireSection>
          }
        />
        <Route
          path="/subjects"
          element={
            <RequireSection section="subjects">
              <SubjectsPage />
            </RequireSection>
          }
        />
        <Route
          path="/attendance"
          element={
            <RequireSection section="attendance">
              <AttendancePage />
            </RequireSection>
          }
        />
        <Route
          path="/academics"
          element={
            <RequireSection section="academics">
              <AcademicRecordsPage />
            </RequireSection>
          }
        />
        <Route
          path="/report-cards"
          element={
            <RequireSection section="reportCards">
              <ReportCardsPage />
            </RequireSection>
          }
        />
        <Route
          path="/finance"
          element={
            <RequireSection section="finance">
              <FinancialsPage />
            </RequireSection>
          }
        />
        <Route
          path="/licensing"
          element={
            <RequireSection section="licensing">
              <Licensing />
            </RequireSection>
          }
        />
        <Route
          path="/structure"
          element={
            <RequireSection section="structure">
              <StructureSettingsPage />
            </RequireSection>
          }
        />
        <Route
          path="/staff"
          element={
            <RequireSection section="staffSettings">
              <StaffSettingsPage />
            </RequireSection>
          }
        />
        <Route
          path="/backup"
          element={
            <RequireSection section="backup">
              <BackupPage />
            </RequireSection>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/**
 * Route-level RBAC guard. Complements Layout.tsx's nav-item filtering (which
 * only hides the *links*) -- this blocks direct URL/hash navigation to a
 * section the current role can't access, redirecting to `redirectTo`
 * (defaults to `/`, the School Home dashboard -- now reachable by every
 * role, see shared/roles.ts's COMMON_SECTIONS, so it's always a safe
 * fallback regardless of which role got redirected).
 */
function RequireSection({
  section,
  redirectTo = '/',
  children,
}: {
  section: AppSection;
  redirectTo?: string;
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  if (!session || !canAccessSection(session.role, section)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
