/**
 * Shared copy for the public marketing pages (home, /features,
 * /primary-schools, /secondary-schools, /school-websites).
 *
 * One source so the home page, the feature pages, the header and the
 * structured data cannot drift apart. Every line describes something the
 * product does today; nothing here is a statistic, a review or a promise.
 */

export const POSITIONING = {
  /** The one-sentence message every surface repeats in its own words. */
  statement:
    "EduIgnite is an all-in-one school management system for nursery, primary and secondary schools in Cameroon, in English and French. Higher education is coming soon.",
  short:
    "All-in-one school management system for nursery, primary and secondary schools in Cameroon, in English and French.",
} as const;

export const HOME_TITLE = "EduIgnite: All-in-One School Management System, Cameroon";
export const HOME_DESCRIPTION =
  "All-in-one school management system for nursery, primary and secondary schools in Cameroon. English and French, report cards, fees, parent app and school websites.";

export type IconName =
  | "users" | "clipboard" | "notebook" | "wallet" | "message" | "library" | "qr" | "wifi"
  | "languages" | "globe" | "calendar" | "shield" | "sparkles" | "video" | "heart"
  | "award" | "layers" | "card" | "megaphone" | "headset" | "handshake" | "graduation" | "inbox";

export type Feature = { icon: IconName; title: string; body: string };
export type FeatureGroup = { id: string; title: string; blurb: string; items: Feature[] };

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "academics",
    title: "Teaching, marks and report cards",
    blurb: "The academic year from the first register to the last report card.",
    items: [
      { icon: "clipboard", title: "Attendance", body: "Registers taken from a phone or computer, with absences visible to parents the same day." },
      { icon: "notebook", title: "Marks and report cards", body: "Enter marks once. Averages, ranks and remarks are worked out for you and report cards print in the official bilingual layout." },
      { icon: "qr", title: "QR-verified documents", body: "Report cards, transcripts and ID cards carry a QR code anyone can scan to check the document is genuine." },
      { icon: "calendar", title: "Timetable and calendar", body: "Class timetables and the school calendar in one place for staff, students and parents." },
      { icon: "video", title: "Online classes", body: "Live classes and assignments for secondary schools that teach part of the week online." },
      { icon: "sparkles", title: "AI tools for secondary teachers", body: "An exam generator and an assistant that help teachers prepare papers and lessons faster. Optional, and the teacher stays in charge." },
    ],
  },
  {
    id: "admin",
    title: "Admissions, fees and administration",
    blurb: "The office work that usually lives in files and cash books.",
    items: [
      { icon: "inbox", title: "Online admissions", body: "Families apply from the school's own website; the school reviews applications and registers accepted pupils." },
      { icon: "users", title: "Student and staff records", body: "One record per learner and staff member, with guardians, classes and roles. Every school's data stays separate from every other school's." },
      { icon: "wallet", title: "Fees and mobile money", body: "Fee structures, instalments, receipts and balances in CFA, with mobile money payments through Fapshi." },
      { icon: "card", title: "ID cards", body: "Printable student ID cards with a QR code." },
      { icon: "library", title: "Library", body: "Book lending with overdue tracking." },
      { icon: "layers", title: "Role-based dashboards", body: "Separate workspaces for the principal and discipline master, teachers, bursar, librarian, students and parents." },
    ],
  },
  {
    id: "families",
    title: "Parents, communication and support",
    blurb: "Keeping families and staff informed without a WhatsApp group.",
    items: [
      { icon: "heart", title: "Parent portal", body: "Parents follow attendance, marks, report cards, fees and messages for each of their children." },
      { icon: "megaphone", title: "Announcements and chat", body: "School notices and direct messages between staff, parents and students." },
      { icon: "headset", title: "Customer care and live chat", body: "Help from the EduIgnite team inside the product." },
    ],
  },
  {
    id: "online",
    title: "Public presence",
    blurb: "A school website that comes with the account.",
    items: [
      { icon: "globe", title: "A public website for every school", body: "Each school can publish its own site on EduIgnite with news, events, gallery and online enrollment, and appear in the EduIgnite school directory." },
    ],
  },
  {
    id: "devices",
    title: "Devices and offline",
    blurb: "Works on every device, with honest limits when the connection drops.",
    items: [
      { icon: "globe", title: "Any browser, any device", body: "Open EduIgnite in Chrome, Edge, Firefox or Safari on a phone, tablet or computer. Nothing to install, and you can add it to the home screen." },
      { icon: "wifi", title: "Android and Windows apps", body: "An Android app (Android 7.0 or newer) and a Windows desktop app (Windows 10 or 11) are available from the download page. There is no iPhone app yet: iPhone and iPad users use the web app." },
      { icon: "wifi", title: "Keeps working offline", body: "Pages you have already opened stay available, and changes you save without a connection (marks, attendance and other school records) are held on the device and sent automatically when you are back online." },
      { icon: "shield", title: "What needs a connection", body: "Signing in, mobile money payments, AI tools and file uploads need an internet connection. EduIgnite tells you instead of queueing them, so nothing is charged or sent by surprise later." },
    ],
  },
  {
    id: "platform",
    title: "Built for how Cameroon works",
    blurb: "Language, learning and partners.",
    items: [
      { icon: "languages", title: "English and French", body: "Both languages across the interface and the documents the school issues." },
      { icon: "graduation", title: "Academy", body: "Courses and guides that teach staff how to use EduIgnite." },
      { icon: "handshake", title: "Partners programme", body: "Individuals and organisations can refer schools to EduIgnite." },
    ],
  },
];

export type LevelProfile = {
  key: "primary" | "secondary";
  slug: string;
  title: string;
  french: string;
  summary: string;
  points: string[];
};

export const LEVELS: LevelProfile[] = [
  {
    key: "primary",
    slug: "/primary-schools",
    title: "Nursery & Primary",
    french: "Maternelle et primaire",
    summary: "Built around the class teacher: one teacher, one class, a few big screens.",
    points: [
      "Class-teacher registers and attendance",
      "All subjects' marks on one screen",
      "Conduct, health records and certificates",
      "Promotion by class level at year end",
    ],
  },
  {
    key: "secondary",
    slug: "/secondary-schools",
    title: "Secondary",
    french: "Secondaire",
    summary: "Subject teachers, class masters, sequences and terms, the way a secondary school runs.",
    points: [
      "Sequences, terms and coefficients",
      "Subject teachers and class masters",
      "Report cards with QR verification",
      "Exams, online classes and AI tools",
    ],
  },
];

export type Faq = { question: string; answer: string };

/** Site-wide questions, shown on /features and the home page, and in FAQPage JSON-LD. */
export const SITE_FAQ: Faq[] = [
  {
    question: "What is EduIgnite?",
    answer:
      "EduIgnite is an all-in-one school management system for nursery, primary and secondary schools in Cameroon. It covers admissions, attendance, marks, report cards, fees, timetables, messaging and a public website for each school, in English and French.",
  },
  {
    question: "Does EduIgnite support both primary and secondary schools?",
    answer:
      "Yes. Nursery and primary schools get a class-teacher workflow with one marks grid per class, conduct, health records and certificates. Secondary schools get sequences and terms, coefficients, subject teachers, class masters, exams and online classes. A school chooses its level when its account is set up.",
  },
  {
    question: "Does every school get a public website?",
    answer:
      "Schools can publish a public website on EduIgnite with news, events, a gallery and online enrollment. A school only appears publicly once it chooses to publish, and published schools are listed in the EduIgnite school directory.",
  },
  {
    question: "Can parents pay school fees with mobile money?",
    answer:
      "Fees are recorded in CFA with receipts and balances, and mobile money payments are supported through Fapshi where the school has enabled them.",
  },
  {
    question: "Is EduIgnite available in French?",
    answer:
      "Yes. The platform runs in English and French, and so do the report cards and other documents the school issues.",
  },
  {
    question: "Does EduIgnite work offline?",
    answer:
      "Partly, and by design. Pages you have already opened stay available, and changes you save without a connection, such as marks and attendance, are held on your device and sent automatically when the connection returns. Signing in, mobile money payments, AI tools and file uploads need an internet connection.",
  },
  {
    question: "Which devices does EduIgnite support?",
    answer:
      "Any modern browser (Chrome, Edge, Firefox or Safari) on a phone, tablet or computer, an Android app for Android 7.0 or newer, and a Windows desktop app for Windows 10 or 11. iPhone and iPad users can use the web app and add it to the home screen. There is no iOS or Mac app yet.",
  },
  {
    question: "Is there support for universities?",
    answer:
      "Not yet. Higher education support is coming soon. Today EduIgnite serves nursery, primary and secondary schools.",
  },
  {
    question: "How does a school get started?",
    answer:
      "Request a school account. The EduIgnite team sets up the school and its administrator, and the school then registers its classes, staff and students.",
  },
];

export const REGIONS = [
  "Adamaoua", "Centre", "Est", "Extrême-Nord", "Littoral", "Nord", "Nord-Ouest", "Ouest", "Sud", "Sud-Ouest",
] as const;
