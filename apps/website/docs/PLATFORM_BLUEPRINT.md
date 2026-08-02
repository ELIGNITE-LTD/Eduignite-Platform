
# EduIgnite SaaS Master Blueprint

This document contains the comprehensive logic, design system, and feature set required to recreate the **EduIgnite SaaS Platform** in Google AI Studio or similar environments.

## 1. Technical Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS + Shadcn UI
- **Icons**: Lucide-React
- **State Management**: React Context (AuthContext for roles/license, I18nContext for language)
- **AI**: Genkit (Teacher Feedback & Assistant)

## 2. Design System Tokens
- **Primary Color**: `#264D73` (Deep Professional Blue)
- **Secondary Color**: `#67D0E4` (Vibrant Academic Cyan)
- **Background**: `#F0F2F5` (Neutral Light Grey)
- **Border Radius**: `2rem` for main cards, `1.5rem` for inputs/buttons (High-Fidelity aesthetic)
- **Typography**: Inter (Sans-serif) with bold font-headline weights for titles.

## 3. Core SaaS Logic (The "Gold" Features)

### A. The License Lockdown (Mandatory Enforcement)
- **Logic**: The `DashboardLayout` checks the `user.isLicensePaid` boolean. 
- **Enforcement**: If `false`, the user is restricted to a full-screen "Dashboard Locked" view.
- **Exceptions**: Only the **Super Admin** and the **Subscription Page** are exempt from the lock.
- **Impact**: Administrative actions (Grades, Finance, Library) are globally suspended for that user/student if the annual fee is unpaid.

### B. Super Admin Governance
- **Global Branding**: CEO can change the Platform Name and Logo URL from settings; this reflects immediately on the Login page.
- **Revenue Control**: Set annual fees for all 6 roles (Student, Teacher, etc.).
- **Deadline Dispatch**: When a global deadline is set, an automated broadcast is sent to all 22,000+ simulated users.
- **Social Proof**: Super Admin can "Push" positive feedback (General Appreciation) to the public login portal as testimonials.

### C. Institutional Authentication
- **ID-Based**: Login uses **Matricule (ID)** and Password.
- **Recovery**: A 4-step workflow:
  1. Identify (Matricule + Email)
  2. Confirmation (Verify identity)
  3. OTP (6-digit verification code input)
  4. Reset (Set new credentials)

## 4. Role-Specific Functionalities

| Role | Key Modules |
|------|-------------|
| **SUPER_ADMIN** | Node Monitoring, Global Pricing, Platform Branding, Support Ledger. |
| **SCHOOL_ADMIN** | Community Sections (Anglophone/Technical), ID Card Generation, Staff Onboarding. |
| **TEACHER** | Gradebook (Cameroon Standards), AI Student Feedback, Timetable Sync. |
| **BURSAR** | Fee Collection (Tuition/Uniforms), Arrears Tracking, Receipt Issuance. |
| **PARENT** | Child Dashboard, Performance Charts, Teacher Chat. |
| **STUDENT** | MCQ Exams (with Timer), Course Materials, Result Certificates. |
| **LIBRARIAN** | Book Catalog, Circulation Management, Membership Audit. |

## 5. UI/UX Signature Elements
- **Printable Documents**: High-fidelity, printable "Official Bulletins" and "Admission Letters" with institutional seals and national headers.
- **Live Charts**: Recharts-based revenue area charts and child performance bars.
- **Dual-Language**: Full English/French toggle across every button, label, and toast.
- **Public Proof**: A "What People Say" dialog on the login page featuring YT video descriptions and institutional testimonials.

---
*Blueprint generated for EduIgnite SaaS v2.4.0 High-Availability.*
