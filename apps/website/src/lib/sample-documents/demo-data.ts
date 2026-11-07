/**
 * Fictional demo data for the public /sample-documents page.
 *
 * Everything here is invented: the school, the people, the matricules, the
 * amounts and the marks. None of it comes from, or resembles, a real record.
 * The names are deliberately generic ("Demo", "Sample") so a visitor can never
 * mistake a sample for a genuine document.
 */

export const DEMO_SCHOOL = {
  name: "Demo International School",
  motto: "Sample Motto - Demonstration Only",
  principal: "Mr. Sample Principal",
  address: "123 Sample Avenue, Demo City",
  location: "Demo City",
  region: "Sample Region",
  division: "Sample Division",
  sub_division: "Sample Subdivision",
  postal_code: "0000",
  phone: "+237 600 000 000",
  email: "demo@example.com",
  logo: "",
  academic_year: "2025/2026",
};

export const DEMO_YEAR = "2025/2026";

const DEMO_STUDENT = {
  name: "Sample Student One",
  matricule: "DEMO-0001",
  date_of_birth: "2010-04-12",
  sex: "Female",
  class: "Form 4",
  student_class: "Form 4",
  class_name: "Form 4",
  cycle: "First",
  class_master: "Ms. Sample Master",
};

/** [subject, coefficient, teacher, base mark out of 20]. */
const SECONDARY_SUBJECTS: Array<[string, number, string, number]> = [
  ["Mathematics", 4, "Mr. Demo Teacher A", 14],
  ["English Language", 3, "Ms. Demo Teacher B", 15],
  ["French", 3, "Mr. Demo Teacher C", 13],
  ["Physics", 3, "Ms. Demo Teacher D", 12],
  ["Chemistry", 2, "Mr. Demo Teacher E", 13],
  ["Biology", 2, "Ms. Demo Teacher F", 16],
  ["History", 2, "Mr. Demo Teacher G", 11],
  ["Geography", 2, "Ms. Demo Teacher H", 14],
  ["Computer Science", 2, "Mr. Demo Teacher I", 17],
];

const REMARKS = ["Excellent", "Very good", "Good", "Fairly good", "Average"];

function buildSecondary(termNumber: 2 | 3) {
  const sequences =
    termNumber === 3
      ? [1, 2, 3, 4, 5, 6].map((n) => ({ id: `seq${n}`, name: `Sequence ${n}`, term: Math.ceil(n / 2) }))
      : [3, 4].map((n) => ({ id: `seq${n}`, name: `Sequence ${n}`, term: 2 }));
  const grades = SECONDARY_SUBJECTS.map(([name, coefficient, teacher, base], index) => {
    const scores = sequences.map((seq, i) => ({
      sequence_id: seq.id,
      score: Math.max(6, Math.min(20, base + ((index + i * 2) % 5) - 2)),
    }));
    const average = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    return {
      subject_id: `sub${index}`,
      subject_name: name,
      teacher_name: teacher,
      coefficient,
      sequence_scores: scores,
      average: Number(average.toFixed(2)),
      total: Number((average * coefficient).toFixed(2)),
      position: ((index * 3) % 9) + 1,
      remark: REMARKS[Math.min(REMARKS.length - 1, Math.max(0, Math.round((20 - average) / 2.5)))],
    };
  });
  const totalCoef = grades.reduce((s, g) => s + g.coefficient, 0);
  const totalPoints = grades.reduce((s, g) => s + g.total, 0);
  return {
    school: DEMO_SCHOOL,
    student: DEMO_STUDENT,
    sequence: { term: termNumber, academic_year: DEMO_YEAR, sequences },
    grades,
    average: Number((totalPoints / totalCoef).toFixed(2)),
    rank: 4,
    class_position: 4,
    total_students: 38,
    class_average: 11.8,
    max_average: 16.4,
    min_average: 6.9,
    conduct: "Very good",
    principal_remark: "A diligent pupil. Keep up the good work. (Sample remark - not a real record.)",
    promotion_status: termNumber === 3 ? "Promoted" : "",
    class_master: DEMO_STUDENT.class_master,
    attendance: { present: 58, absent: 2, late: 1 },
  };
}

export const secondaryReportTerm2 = () => buildSecondary(2);
export const secondaryReportAnnual = () => buildSecondary(3);

const PRIMARY_SUBJECTS: Array<[string, number, number, number]> = [
  ["English Language", 4, 15, 13],
  ["Mathematics", 4, 16, 14],
  ["Science and Technology", 3, 13, 12],
  ["Social Studies", 2, 14, 11],
  ["Citizenship", 2, 17, 15],
  ["Physical Education", 1, 18, 16],
];

function primaryGrades(frenchLabels: boolean) {
  return PRIMARY_SUBJECTS.map(([name, coefficient, test, exam], index) => {
    const average = (test + exam) / 2;
    const label = average >= 16 ? "Excellent" : average >= 14 ? "Very Good" : average >= 12 ? "Good" : "Fair";
    const labelFr = average >= 16 ? "Excellent" : average >= 14 ? "Très bien" : average >= 12 ? "Bien" : "Assez bien";
    return {
      subject_id: `p${index}`,
      subject_name: frenchLabels ? FRENCH_PRIMARY[index] : name,
      coefficient,
      sequence_scores: [
        { score: test, evaluation_label: "Test", evaluation_label_fr: "Devoir" },
        { score: exam, evaluation_label: "Exam", evaluation_label_fr: "Compo." },
      ],
      average,
      total: average * coefficient,
      position: index + 2,
      class_average: 11.5 + (index % 3),
      grade_label: label,
      grade_label_fr: labelFr,
    };
  });
}

const FRENCH_PRIMARY = ["Anglais", "Mathématiques", "Sciences et technologie", "Éducation à la citoyenneté", "Éducation civique", "Éducation physique"];

const PRIMARY_ASSESSMENT = {
  show_average: true,
  show_rank: true,
  max_score: 20,
  pass_mark: 10,
  evaluation_labels: [
    { label: "Test", label_fr: "Devoir" },
    { label: "Exam", label_fr: "Compo." },
  ],
};

function primaryBase(termNumber: 2 | 3, french: boolean) {
  const grades = primaryGrades(french);
  const totalCoef = grades.reduce((s, g) => s + g.coefficient, 0);
  const totalMarks = grades.reduce((s, g) => s + g.total, 0);
  return {
    layout: "primary" as const,
    school: { ...DEMO_SCHOOL, subsystem: french ? "francophone" : "anglophone" },
    student: {
      name: "Sample Pupil Two",
      matricule: "DEMO-P-0002",
      date_of_birth: "2015-09-03",
      sex: "Male",
      class_teacher: "Ms. Sample Teacher",
      guardian_name: "Mr. Sample Guardian",
    },
    class_name: french ? "CM1" : "Class 5",
    section: "A",
    academic_year: DEMO_YEAR,
    term_number: termNumber,
    grades,
    assessment: PRIMARY_ASSESSMENT,
    use_coefficients: true,
    show_coefficients: true,
    show_class_average: true,
    show_subject_position: true,
    show_rank: true,
    show_attendance: true,
    show_conduct: true,
    show_promotion: true,
    show_average: true,
    total_coefficient: totalCoef,
    total_marks: totalMarks,
    average: Number((totalMarks / totalCoef).toFixed(2)),
    average_label: "Very Good",
    average_label_fr: "Très bien",
    rank: 3,
    total_students: 32,
    class_average: 12.4,
    attendance: { present: 56, absent: 2, late: 1, excused: 1 },
    conduct: french ? "Très bien" : "Very good",
    teacher_comment: french
      ? "Élève sérieux. Exemple de remarque - donnée fictive."
      : "A hardworking pupil. Sample remark - fictional data.",
    headmaster_comment: french ? "Continuez ainsi. (Exemple fictif)" : "Keep it up. (Fictional sample)",
    signatures: {
      class_teacher: { name: "Ms. Sample Teacher" },
      headmaster: { name: "Mr. Sample Principal" },
      parent: { name: "Mr. Sample Guardian" },
    },
  };
}

export const primaryReportEn = () => primaryBase(2, false);
export const primaryReportFrAnnual = () => ({
  ...primaryBase(3, true),
  term_averages: { "1": 13.1, "2": 13.8, "3": 14.2 },
  annual_average: 13.7,
  annual_label: "Very Good",
  annual_label_fr: "Très bien",
  promotion_decision: "promoted" as const,
});

const NURSERY_AREAS = [
  ["Language and Communication", "Langage et communication"],
  ["Early Numeracy", "Pré-mathématiques"],
  ["Social and Emotional Development", "Développement social et affectif"],
  ["Creative Arts", "Arts créatifs"],
  ["Physical Development", "Développement physique"],
  ["Discovery of the World", "Découverte du monde"],
];

function nurseryBase(french: boolean) {
  return {
    layout: "nursery" as const,
    school: { ...DEMO_SCHOOL, subsystem: french ? "francophone" : "anglophone" },
    student: {
      name: "Sample Child Three",
      matricule: "DEMO-N-0003",
      date_of_birth: "2020-01-20",
      sex: "Female",
      class_teacher: "Ms. Sample Teacher",
      guardian_name: "Ms. Sample Guardian",
    },
    class_name: french ? "Section Moyenne" : "Nursery 2",
    section: "A",
    academic_year: DEMO_YEAR,
    term_number: 2,
    assessment: { show_average: false },
    show_attendance: true,
    show_conduct: true,
    show_promotion: true,
    areas: NURSERY_AREAS.map(([name, name_fr], i) => ({ id: `a${i}`, name, name_fr, order: i, level: [4, 3, 4, 3, 4, 2][i] })),
    nursery_scale: [
      { level: 1, label: "Beginning", label_fr: "Débutant" },
      { level: 2, label: "Developing", label_fr: "En développement" },
      { level: 3, label: "Secure", label_fr: "Acquis" },
      { level: 4, label: "Advanced", label_fr: "Avancé" },
    ],
    attendance: { present: 54, absent: 3, late: 2, excused: 1 },
    conduct: french ? "Très bien" : "Very good",
    teacher_comment: french
      ? "Enfant curieux et joyeux. Exemple fictif."
      : "A curious and cheerful child. Fictional sample observation.",
    headmaster_comment: french ? "Bon travail. (Exemple fictif)" : "Well done. (Fictional sample)",
    promotion_decision: "promoted" as const,
    signatures: {
      class_teacher: { name: "Ms. Sample Teacher" },
      headmaster: { name: "Mr. Sample Principal" },
    },
  };
}

export const nurseryReportEn = () => nurseryBase(false);
export const nurseryReportFr = () => nurseryBase(true);

/** Official multi-year transcript (First and Second Cycle). */
export function transcriptData() {
  const subjects = ["Mathematics", "English Language", "French", "Physics", "Chemistry", "Biology", "History", "Geography"];
  const firstLevels = ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5"];
  const secondLevels = ["Lower Sixth", "Upper Sixth"];
  const cycle = (levels: string[], offset: number) => ({
    levels,
    rows: subjects.map((subject, si) => ({
      subject,
      coefficient: 2,
      cells: Object.fromEntries(
        levels.map((level, li) => {
          const base = 11 + ((si + li + offset) % 6);
          return [level, { t1: base, t2: base + 0.5, t3: base + 1, ann: base + 0.5 }];
        }),
      ),
    })),
    annual: Object.fromEntries(levels.map((level, li) => [level, 12.4 + li * 0.35])),
  });
  return {
    student: {
      name: "Sample Student One",
      date_of_birth: "2007-04-12",
      matricule: "DEMO-0001",
      sex: "Female",
    },
    school: DEMO_SCHOOL,
    first_cycle: cycle(firstLevels, 0),
    second_cycle: cycle(secondLevels, 2),
  };
}

export const honourRollEntry = {
  name: "Sample Student One",
  class_name: "Form 4",
  academic_year: DEMO_YEAR,
  average: 16.42,
  term_label: "Second Term",
  class_master: "Ms. Sample Master",
  principal: "Mr. Sample Principal",
};

export function performanceReport() {
  const top = (names: string[], start: number) =>
    names.map((name, i) => ({ position: i + 1, name, matricule: `DEMO-${start + i}`, average: Number((16.2 - i * 0.9).toFixed(2)) }));
  const bottom = (names: string[], start: number) =>
    names.map((name, i) => ({ position: 30 - i, name, matricule: `DEMO-${start + i}`, average: Number((7.4 + i * 0.6).toFixed(2)) }));
  return {
    academic_year: DEMO_YEAR,
    term: "Second Term",
    scope: "School",
    pass_mark: 10,
    student_count: 68,
    passed_count: 49,
    failed_count: 19,
    promoted_count: 0,
    repeated_count: 0,
    school_average: 11.92,
    best: { name: "Sample Student One", matricule: "DEMO-0001", class_name: "Form 4", average: 16.42 },
    weakest: { name: "Sample Student Nine", matricule: "DEMO-0009", class_name: "Form 5", average: 6.85 },
    classes: [
      {
        class_name: "Form 4",
        student_count: 34,
        passed_count: 26,
        failed_count: 8,
        class_average: 12.31,
        top: top(["Sample Student One", "Sample Student Four", "Sample Student Five"], 1),
        bottom: bottom(["Sample Student Seven", "Sample Student Eight"], 7),
      },
      {
        class_name: "Form 5",
        student_count: 34,
        passed_count: 23,
        failed_count: 11,
        class_average: 11.53,
        top: top(["Sample Student Ten", "Sample Student Eleven", "Sample Student Twelve"], 10),
        bottom: bottom(["Sample Student Nine", "Sample Student Thirteen"], 9),
      },
    ],
  };
}

export const receiptData = {
  receiptNo: "DEMO-RCPT-0001",
  reference: "DEMO-REF-0001",
  studentName: "Sample Student One",
  matricule: "DEMO-0001",
  studentClass: "Form 4",
  academicYear: DEMO_YEAR,
  items: [{ label: "Tuition Fee - Second Instalment", amount: 75000 }],
  currency: "XAF",
  method: "Cash",
  date: "2026-01-15",
  recordedBy: "Sample Bursar",
  status: "confirmed",
  kind: "Fee Payment",
  schoolName: DEMO_SCHOOL.name,
  schoolMotto: DEMO_SCHOOL.motto,
  schoolAddress: DEMO_SCHOOL.address,
  schoolLogo: "",
};

export const multiItemReceiptData = {
  ...receiptData,
  receiptNo: "DEMO-RCPT-0002",
  reference: "DEMO-REF-0002",
  studentName: "Sample Student Two",
  matricule: "DEMO-0002",
  studentClass: "Form 2",
  items: [
    { label: "Tuition Fee - First Instalment", amount: 100000 },
    { label: "PTA Levy", amount: 10000 },
    { label: "Sports and Library Fee", amount: 7500 },
  ],
  method: "Mobile Money",
  date: "2025-10-02",
};

const FEE_ROWS = [
  ["Sample Student One", "DEMO-0001", "Form 4", 250000, 250000],
  ["Sample Student Two", "DEMO-0002", "Form 2", 250000, 117500],
  ["Sample Student Three", "DEMO-0003", "Form 1", 250000, 0],
  ["Sample Student Four", "DEMO-0004", "Form 5", 275000, 200000],
  ["Sample Student Five", "DEMO-0005", "Form 3", 250000, 175000],
  ["Sample Student Six", "DEMO-0006", "Form 4", 250000, 50000],
] as const;

function feeRows() {
  return FEE_ROWS.map(([student, matricule, className, total, paid]) => ({
    student,
    matricule,
    className,
    total,
    paid,
    balance: total - paid,
    status: paid >= total ? "Paid" : paid > 0 ? "Partial" : "Unpaid",
  }));
}

function feeStatement(status: string, rows: ReturnType<typeof feeRows>) {
  const billed = rows.reduce((s, r) => s + r.total, 0);
  const collected = rows.reduce((s, r) => s + r.paid, 0);
  return {
    schoolName: DEMO_SCHOOL.name,
    schoolLogo: DEMO_SCHOOL.logo,
    schoolMotto: DEMO_SCHOOL.motto,
    signatoryRole: "The Bursar",
    signatoryName: "Sample Bursar",
    filters: { status, className: "All classes", feeType: "All fee types" },
    rows,
    totals: {
      billed,
      collected,
      outstanding: billed - collected,
      collectionRate: billed ? Math.round((collected / billed) * 100) : 0,
    },
  };
}

export const feeStatementAll = () => feeStatement("All", feeRows());
export const feeStatementOutstanding = () => feeStatement("Outstanding", feeRows().filter((r) => r.balance > 0));

const STUDENT_NAMES = [
  "Sample Student One", "Sample Student Two", "Sample Student Three", "Sample Student Four",
  "Sample Student Five", "Sample Student Six", "Sample Student Seven", "Sample Student Eight",
];

export function studentRosterRows() {
  return STUDENT_NAMES.map((name, i) => [
    i + 1,
    name,
    `DEMO-${String(i + 1).padStart(4, "0")}`,
    `ADM-${2025000 + i + 1}`,
    ["Form 4", "Form 2", "Form 1", "Form 5"][i % 4],
    "Anglophone Section",
    `Sample Guardian ${i + 1}`,
    `+237 600 000 0${String(i).padStart(2, "0")}`,
  ]);
}

export function staffRosterRows() {
  const roles: Array<[string, string, string]> = [
    ["Mr. Demo Teacher A", "Teacher", "Mathematics"],
    ["Ms. Demo Teacher B", "Teacher", "English Language"],
    ["Mr. Demo Teacher C", "Teacher", "French"],
    ["Ms. Demo Bursar", "Bursar", "-"],
    ["Mr. Demo Librarian", "Librarian", "-"],
    ["Ms. Demo Vice Principal", "Sub Admin", "-"],
  ];
  return roles.map(([name, role, subjects], i) => [
    i + 1,
    name,
    `DEMO-S-${String(i + 1).padStart(3, "0")}`,
    role,
    subjects,
    "Anglophone Section",
    `staff${i + 1}@example.com`,
    `+237 600 111 0${String(i).padStart(2, "0")}`,
  ]);
}

export const classListRows = [
  [1, "Form 1", "Ms. Sample Master A", 6, 12, 40],
  [2, "Form 2", "Mr. Sample Master B", 7, 12, 38],
  [3, "Form 3", "Ms. Sample Master C", 7, 13, 36],
  [4, "Form 4", "Ms. Sample Master", 8, 14, 34],
  [5, "Form 5", "Mr. Sample Master D", 8, 14, 34],
];

export const examResultRows = [
  [1, "Sample Student One", "DEMO-0001", 18, 20, "90%", "Wrote"],
  [2, "Sample Student Four", "DEMO-0004", 16, 20, "80%", "Wrote"],
  [3, "Sample Student Two", "DEMO-0002", 14, 20, "70%", "Wrote"],
  [4, "Sample Student Five", "DEMO-0005", 9, 20, "45%", "Wrote"],
  [5, "Sample Student Six", "DEMO-0006", "-", "-", "-", "Absent"],
];

export const activationRows = STUDENT_NAMES.slice(0, 6).map((_, i) => [
  i + 1,
  `DEMO-${String(i + 1).padStart(4, "0")}`,
  "Form 1",
  "Form 1",
  "Anglophone Section",
]);

export function attendanceReport() {
  const names = ["Sample Student One", "Sample Student Two", "Sample Student Three", "Sample Student Four"];
  const statuses = ["Present", "Present", "Late", "Absent"];
  const rows = ["2026-02-02", "2026-02-03"].flatMap((date, d) =>
    names.map((student_name, i) => ({
      date,
      class_name: "Form 4",
      subject: "",
      period: "Morning",
      student_name,
      admission_number: `ADM-${2025001 + i}`,
      status: statuses[(i + d) % statuses.length],
      remarks: "",
    })),
  );
  return {
    kind: "school" as const,
    school: {
      name: DEMO_SCHOOL.name,
      motto: DEMO_SCHOOL.motto,
      logo: DEMO_SCHOOL.logo,
      principal: DEMO_SCHOOL.principal,
      address: DEMO_SCHOOL.address,
      phone: DEMO_SCHOOL.phone,
      email: DEMO_SCHOOL.email,
    },
    teacher_name: "",
    filters: {
      academic_year: DEMO_YEAR,
      term: "Second Term",
      start_date: "2026-02-02",
      end_date: "2026-02-03",
      class: "Form 4",
    },
    summary: {
      students_on_roll: 4,
      students_recorded: 4,
      sessions: 2,
      records: 8,
      present: 3,
      absent: 2,
      late: 3,
      excused: 0,
      attendance_rate: 75,
    },
    rows,
  };
}

export const classicIdStudent = {
  name: "Sample Student One",
  matricule: "DEMO-0001",
  className: "Form 4",
  section: "Anglophone",
  dob: "2010-04-12",
  placeOfBirth: "Demo City",
  gender: "Female",
  admissionNumber: "ADM-2025001",
  guardian: "Sample Guardian",
  guardianPhone: "+237 600 000 000",
};

export const classicIdSchool: { name: string; motto: string; address: string; phone: string; principal: string; logo?: string } = {
  name: DEMO_SCHOOL.name,
  motto: DEMO_SCHOOL.motto,
  address: DEMO_SCHOOL.address,
  phone: DEMO_SCHOOL.phone,
  principal: DEMO_SCHOOL.principal,
};

export const basicIdSchool: { name: string; address: string; logo?: string } = { name: DEMO_SCHOOL.name, address: DEMO_SCHOOL.address };

export const basicStudentCard = {
  kind: "student" as const,
  name: "Sample Pupil Two",
  idNo: "DEMO-P-0002",
  level: "Class 5",
  stream: "A",
  dob: "2015-09-03",
  emergencyName: "Mr. Sample Guardian",
  emergencyPhone: "+237 600 000 000",
  academicYear: "2025 - 2026",
  school: basicIdSchool,
};

export const basicStaffCard = {
  kind: "staff" as const,
  name: "Ms. Sample Teacher",
  idNo: "DEMO-S-001",
  role: "Class Teacher",
  academicYear: "2025 - 2026",
  emergencyName: "Sample Contact",
  emergencyPhone: "+237 600 000 000",
  school: basicIdSchool,
};

/** Sets the inline demo crest on every demo school record (called once, client-side, before any sample is built). */
export function applyDemoLogo(dataUri: string) {
  DEMO_SCHOOL.logo = dataUri;
  receiptData.schoolLogo = dataUri;
  multiItemReceiptData.schoolLogo = dataUri;
  classicIdSchool.logo = dataUri;
  basicIdSchool.logo = dataUri;
}
