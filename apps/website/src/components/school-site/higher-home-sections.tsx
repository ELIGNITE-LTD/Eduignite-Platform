import Link from "next/link";
import { BookOpen, Building2, ClipboardCheck, GraduationCap, Landmark, Mail, MapPin, MessageCircle, Phone, Plus, UserPlus, Users } from "lucide-react";

import type { PublicSchool, SchoolLang } from "@/lib/public-schools";
import { buildWhatsAppLink } from "@/lib/school-site-extras";
import { facultyGroups, programmeHref, type Department, type Programme } from "@/lib/school-site-programmes";
import { Reveal } from "@/components/school-site/reveal";
import type { SchoolSection } from "@/lib/school-site";

/**
 * Extra home-page blocks for higher-education sites. Every block is built from what the institution has already
 * published (programmes, departments, contact details); nothing is invented, and a block with nothing to show
 * does not render.
 */

const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10";
const H2 = "text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl";

const T = {
  en: {
    facultiesTitle: "Faculties and departments", facultiesLead: "Find your place in the institution.", departments: "departments", department: "department", programme: "programme", viewProgrammes: "See programmes",
    whyTitle: "Why study here", whyLead: "A clear path from admission to graduation, with standards you can check.",
    programmes: "Programmes", awardLevels: "Award levels", deptsLabel: "Departments", lmd: "LMD system", lmdText: "Licence, Master and Doctorate pathways with credits and semesters.",
    bilingual: "Bilingual teaching", bilingualText: "English and French, in the spirit of Cameroon's two linguistic subsystems.",
    credits: "Credit-based learning", creditsText: "Every course unit carries credits that add up to your degree, tracked semester by semester.",
    results: "Transparent results", resultsText: "Continuous assessment and exam marks, published to you with your GPA or average.",
    stepsTitle: "How to apply", stepsLead: "Four simple steps from enquiry to admission.",
    s1: "Choose a programme", s1t: "Browse the programmes and pick the level and department that fit your goals.",
    s2: "Contact admissions", s2t: "Ask your questions on WhatsApp or by email and get the list of documents.",
    s3: "Submit your application", s3t: "Apply online, or bring your file to the admissions office.",
    s4: "Receive your matricule", s4t: "Once admitted you get a matricule to activate your student account.",
    apply: "Apply now", browse: "Browse programmes",
    contactTitle: "Visit or contact us", contactLead: "We answer enquiries from future students and parents.", address: "Address", phone: "Phone", email: "Email", whatsapp: "WhatsApp", chat: "Chat on WhatsApp", contactCta: "About us",
    faqTitle: "Frequently asked questions",
    q1: "How do I apply?", a1: "Choose a programme, contact the admissions office, then submit your application. You will receive a matricule once you are admitted.",
    q2: "Which languages are taught?", a2: "Teaching follows Cameroon's bilingual policy. Ask the admissions office which language each programme uses.",
    q3: "How is my work graded?", a3: "Each course unit combines continuous assessment and an exam. Your GPA out of 4.0 or average out of 20 is computed from your published results.",
    q4: "How do I pay tuition?", a4: "Fees are paid directly to the institution (cash, MTN Mobile Money, Orange Money or bank). You receive a numbered receipt for every payment.",
  },
  fr: {
    facultiesTitle: "Facultés et départements", facultiesLead: "Trouvez votre place dans l'établissement.", departments: "départements", department: "département", programme: "filière", viewProgrammes: "Voir les filières",
    whyTitle: "Pourquoi étudier ici", whyLead: "Un parcours clair de l'admission au diplôme, avec des standards vérifiables.",
    programmes: "Filières", awardLevels: "Niveaux de diplôme", deptsLabel: "Départements", lmd: "Système LMD", lmdText: "Parcours Licence, Master et Doctorat avec crédits et semestres.",
    bilingual: "Enseignement bilingue", bilingualText: "Anglais et français, dans l'esprit des deux sous-systèmes linguistiques du Cameroun.",
    credits: "Apprentissage par crédits", creditsText: "Chaque unité d'enseignement vaut des crédits qui s'additionnent pour votre diplôme, suivis semestre par semestre.",
    results: "Résultats transparents", resultsText: "Notes de contrôle continu et d'examen publiées avec votre GPA ou votre moyenne.",
    stepsTitle: "Comment candidater", stepsLead: "Quatre étapes simples, de la demande d'information à l'admission.",
    s1: "Choisissez une filière", s1t: "Parcourez les filières et choisissez le niveau et le département qui correspondent à votre projet.",
    s2: "Contactez l'admission", s2t: "Posez vos questions sur WhatsApp ou par e-mail et obtenez la liste des pièces à fournir.",
    s3: "Déposez votre dossier", s3t: "Candidatez en ligne ou déposez votre dossier au service des admissions.",
    s4: "Recevez votre matricule", s4t: "Une fois admis, vous recevez un matricule pour activer votre compte étudiant.",
    apply: "Candidater", browse: "Voir les filières",
    contactTitle: "Venez nous voir ou contactez-nous", contactLead: "Nous répondons aux futurs étudiants et à leurs parents.", address: "Adresse", phone: "Téléphone", email: "E-mail", whatsapp: "WhatsApp", chat: "Discuter sur WhatsApp", contactCta: "À propos",
    faqTitle: "Questions fréquentes",
    q1: "Comment candidater ?", a1: "Choisissez une filière, contactez le service des admissions, puis déposez votre dossier. Vous recevrez un matricule une fois admis.",
    q2: "Quelles langues sont enseignées ?", a2: "L'enseignement suit la politique de bilinguisme du Cameroun. Demandez au service des admissions la langue de chaque filière.",
    q3: "Comment suis-je noté ?", a3: "Chaque unité d'enseignement combine contrôle continu et examen. Votre GPA sur 4,0 ou votre moyenne sur 20 est calculé à partir des résultats publiés.",
    q4: "Comment payer la scolarité ?", a4: "Les frais sont payés directement à l'établissement (espèces, MTN Mobile Money, Orange Money ou banque). Vous recevez un reçu numéroté pour chaque paiement.",
  },
} as const;

type Href = (s: SchoolSection) => string;

export function HomeFaculties({ lang, departments, programmes, href }: { lang: SchoolLang; departments: Department[]; programmes: Programme[]; href: Href }) {
  const t = T[lang];
  const groups = facultyGroups(departments);
  if (groups.length === 0) return null;
  const countFor = (name: string) => programmes.filter((p) => p.department_name === name).length;
  return (
    <section className="py-20 sm:py-28" aria-labelledby="home-faculties">
      <div className={WRAP}>
        <Reveal className="mb-12 max-w-2xl">
          <h2 id="home-faculties" className={H2}>{t.facultiesTitle}</h2>
          <p className="he-serif mt-3 text-lg text-[var(--he-muted)]">{t.facultiesLead}</p>
        </Reveal>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.slice(0, 6).map((g, i) => (
            <Reveal as="li" key={g.faculty || `loose-${i}`} delay={(i % 3) as 0 | 1 | 2} className="he-lift border border-[var(--he-line)] bg-[var(--he-surface)] p-6">
              <span className="inline-flex h-11 w-11 items-center justify-center bg-[var(--he-paper)] text-[var(--he-accent)]"><Building2 className="h-5 w-5" aria-hidden /></span>
              <h3 className="he-serif mt-4 text-2xl font-medium text-[var(--he-text)]">{g.faculty || t.deptsLabel}</h3>
              <p className="mt-1 text-sm text-[var(--he-muted)]">{g.departments.length} {g.departments.length === 1 ? t.department : t.departments}</p>
              <ul className="mt-4 space-y-2 border-t border-[var(--he-line)] pt-4">
                {g.departments.slice(0, 5).map((d) => (
                  <li key={d}>
                    <Link href={programmeHref(href("programmes"), { department: d })} className="flex items-center justify-between gap-3 text-[15px] text-[var(--he-text)] transition-colors hover:text-[var(--he-accent)]">
                      <span>{d}</span>
                      <span className="text-xs text-[var(--he-muted)]">{countFor(d) > 0 ? `${countFor(d)} ${countFor(d) === 1 ? t.programme : t.programmes.toLowerCase()}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HomeWhy({ lang, programmes, departments }: { lang: SchoolLang; programmes: Programme[]; departments: Department[] }) {
  const t = T[lang];
  const levels = new Set(programmes.map((p) => p.award_level)).size;
  const figures = [
    ...(programmes.length ? [{ value: programmes.length, label: t.programmes }] : []),
    ...(levels ? [{ value: levels, label: t.awardLevels }] : []),
    ...(departments.length ? [{ value: departments.length, label: t.deptsLabel }] : []),
  ];
  const features = [
    { icon: GraduationCap, title: t.lmd, text: t.lmdText },
    { icon: BookOpen, title: t.credits, text: t.creditsText },
    { icon: Landmark, title: t.bilingual, text: t.bilingualText },
    { icon: ClipboardCheck, title: t.results, text: t.resultsText },
  ];
  return (
    <section className="bg-[var(--he-paper)] py-20 sm:py-28" aria-labelledby="home-why">
      <div className={WRAP}>
        <Reveal className="mb-12 max-w-2xl">
          <h2 id="home-why" className={H2}>{t.whyTitle}</h2>
          <p className="he-serif mt-3 text-lg text-[var(--he-muted)]">{t.whyLead}</p>
        </Reveal>
        {figures.length > 0 ? (
          <Reveal className="mb-10 grid grid-cols-3 gap-4 border-y border-[var(--he-line)] py-8 text-center">
            {figures.map((f) => (
              <div key={f.label}>
                <p className="he-serif text-5xl font-medium text-[var(--he-text)] sm:text-6xl">{f.value}</p>
                <p className="mt-2 text-sm text-[var(--he-muted)]">{f.label}</p>
              </div>
            ))}
          </Reveal>
        ) : null}
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal as="li" key={f.title} delay={(i % 4) as 0 | 1 | 2 | 3} className="he-lift border border-[var(--he-line)] bg-[var(--he-surface)] p-6">
              <f.icon className="h-6 w-6 text-[var(--he-accent)]" aria-hidden />
              <h3 className="he-serif mt-4 text-xl font-medium text-[var(--he-text)]">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--he-muted)]">{f.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HomeSteps({ lang, href, enrollmentEnabled }: { lang: SchoolLang; href: Href; enrollmentEnabled: boolean }) {
  const t = T[lang];
  const steps = [
    { icon: BookOpen, title: t.s1, text: t.s1t },
    { icon: MessageCircle, title: t.s2, text: t.s2t },
    { icon: UserPlus, title: t.s3, text: t.s3t },
    { icon: Users, title: t.s4, text: t.s4t },
  ];
  return (
    <section className="py-20 sm:py-28" aria-labelledby="home-steps">
      <div className={WRAP}>
        <Reveal className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 id="home-steps" className={H2}>{t.stepsTitle}</h2>
            <p className="he-serif mt-3 text-lg text-[var(--he-muted)]">{t.stepsLead}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {enrollmentEnabled ? <Link href={href("enrollment")} className="he-btn he-btn-ink">{t.apply}</Link> : null}
            <Link href={href("programmes")} className="he-btn he-btn-outline">{t.browse}</Link>
          </div>
        </Reveal>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={(i % 4) as 0 | 1 | 2 | 3} className="relative border border-[var(--he-line)] bg-[var(--he-surface)] p-6">
              <span className="he-serif absolute right-5 top-3 text-6xl font-medium text-[var(--he-line)]" aria-hidden>{i + 1}</span>
              <span className="inline-flex h-11 w-11 items-center justify-center bg-[var(--he-paper)] text-[var(--he-accent)]"><s.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="he-serif mt-4 text-xl font-medium text-[var(--he-text)]">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--he-muted)]">{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function HomeContact({ school, lang, href }: { school: PublicSchool; lang: SchoolLang; href: Href }) {
  const t = T[lang];
  const place = [school.address, school.city_village || school.location, school.region].filter(Boolean).reduce<string[]>((parts, part) => {
    const lower = part.toLowerCase();
    return parts.some((p) => p.toLowerCase().includes(lower)) ? parts : [...parts, part];
  }, []).join(", ");
  const wa = buildWhatsAppLink(school.whatsapp_number, school.name, lang);
  const rows = [
    ...(place ? [{ icon: MapPin, label: t.address, value: place, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${school.name} ${place}`)}` }] : []),
    ...(school.phone ? [{ icon: Phone, label: t.phone, value: school.phone, href: `tel:${school.phone.replace(/[^\d+]/g, "")}` }] : []),
    ...(school.email ? [{ icon: Mail, label: t.email, value: school.email, href: `mailto:${school.email}` }] : []),
  ];
  if (rows.length === 0 && !wa) return null;
  return (
    <section className="bg-[var(--he-paper)] py-20 sm:py-28" aria-labelledby="home-contact">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-12`}>
        <Reveal className="lg:col-span-5">
          <h2 id="home-contact" className={H2}>{t.contactTitle}</h2>
          <p className="he-serif mt-3 text-lg text-[var(--he-muted)]">{t.contactLead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="he-btn he-btn-whatsapp"><MessageCircle className="h-4 w-4" aria-hidden />{t.chat}</a> : null}
            <Link href={href("about")} className="he-btn he-btn-outline">{t.contactCta}</Link>
          </div>
        </Reveal>
        <ul className="space-y-4 lg:col-span-7">
          {rows.map((r, i) => (
            <Reveal as="li" key={r.label} delay={(i % 3) as 0 | 1 | 2}>
              <a href={r.href} target={r.label === t.address ? "_blank" : undefined} rel="noopener noreferrer" className="he-lift flex items-start gap-4 border border-[var(--he-line)] bg-[var(--he-surface)] p-5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-[var(--he-paper)] text-[var(--he-accent)]"><r.icon className="h-5 w-5" aria-hidden /></span>
                <span><span className="block text-xs font-semibold uppercase tracking-wider text-[var(--he-muted)]">{r.label}</span><span className="mt-1 block text-lg text-[var(--he-text)]">{r.value}</span></span>
              </a>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HomeFaq({ lang }: { lang: SchoolLang }) {
  const t = T[lang];
  const items = [[t.q1, t.a1], [t.q2, t.a2], [t.q3, t.a3], [t.q4, t.a4]];
  return (
    <section className="py-20 sm:py-28" aria-labelledby="home-faq">
      <div className={`${WRAP} grid gap-10 lg:grid-cols-12`}>
        <Reveal className="lg:col-span-4"><h2 id="home-faq" className={H2}>{t.faqTitle}</h2></Reveal>
        <Reveal className="he-faq divide-y divide-[var(--he-line)] border-y border-[var(--he-line)] lg:col-span-8">
          {items.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex items-center justify-between gap-4 text-lg font-medium text-[var(--he-text)]">
                {q}<Plus className="he-faq-plus h-5 w-5 shrink-0 text-[var(--he-accent)]" aria-hidden />
              </summary>
              <p className="he-serif mt-3 max-w-3xl text-lg leading-relaxed text-[var(--he-muted)]">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
