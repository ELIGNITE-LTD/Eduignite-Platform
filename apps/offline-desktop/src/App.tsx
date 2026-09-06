import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { SchoolProvider } from './context/SchoolContext';
import Layout from './components/Layout';
import SchoolProfilePage from './pages/SchoolProfilePage';
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

export default function App() {
  return (
    <SchoolProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<SchoolProfilePage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:studentId" element={<StudentProfilePage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/academics" element={<AcademicRecordsPage />} />
          <Route path="/report-cards" element={<ReportCardsPage />} />
          <Route path="/finance" element={<FinancialsPage />} />
          <Route path="/licensing" element={<Licensing />} />
        </Route>
      </Routes>
    </SchoolProvider>
  );
}
