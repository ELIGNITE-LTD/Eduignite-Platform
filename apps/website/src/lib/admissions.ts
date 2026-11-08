/**
 * Online admissions: types for the public form config and the admin review API
 * (backend/apps/schools/admissions_views.py) plus the form text in English and
 * French. Applications are children's records: nothing here is cached or logged.
 */
import type { SchoolLang } from "@/lib/public-schools";

export const ADMISSIONS_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export type FieldMode = "required" | "optional";

export type AdmissionConfig = {
  state: "open";
  intake_year: string;
  opens_on: string | null;
  closes_on: string | null;
  fields: Partial<Record<string, FieldMode>>;
  classes: { id: string; name: string; group: string }[];
  consent_text: { en: string; fr: string };
  relationships: string[];
  documents: { types: string[]; max_mb: number; max_files: number };
  form_token: string;
};

export type AdmissionAvailability =
  | { kind: "open"; config: AdmissionConfig }
  | { kind: "closed"; reason: "closed" | "not_yet_open"; opens_on: string | null; closes_on: string | null }
  | { kind: "unavailable" };

/** Server-side read of the form configuration. Never cached: it carries a one-time form token. */
export async function fetchAdmissionAvailability(slug: string, lang: SchoolLang): Promise<AdmissionAvailability> {
  try {
    const res = await fetch(`${ADMISSIONS_API}/schools/public/${encodeURIComponent(slug)}/enrollment/?lang=${lang}`, {
      cache: "no-store",
    });
    if (res.ok) return { kind: "open", config: (await res.json()) as AdmissionConfig };
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      if (body?.state === "closed") {
        return { kind: "closed", reason: body.reason === "not_yet_open" ? "not_yet_open" : "closed", opens_on: body.opens_on ?? null, closes_on: body.closes_on ?? null };
      }
    }
  } catch {
    /* fall through */
  }
  return { kind: "unavailable" };
}

export const RELATIONSHIP_LABELS: Record<string, { en: string; fr: string }> = {
  father: { en: "Father", fr: "Père" },
  mother: { en: "Mother", fr: "Mère" },
  uncle: { en: "Uncle", fr: "Oncle" },
  aunt: { en: "Aunt", fr: "Tante" },
  elder_sibling: { en: "Elder sibling", fr: "Frère / sœur aîné(e)" },
  legal_guardian: { en: "Legal guardian", fr: "Tuteur légal" },
  other: { en: "Other", fr: "Autre" },
};

export const STATUS_LABELS: Record<string, { en: string; fr: string }> = {
  new: { en: "New", fr: "Nouvelle" },
  under_review: { en: "Under review", fr: "En examen" },
  accepted: { en: "Accepted", fr: "Acceptée" },
  rejected: { en: "Rejected", fr: "Refusée" },
  waitlisted: { en: "Waitlisted", fr: "Liste d'attente" },
  enrolled: { en: "Enrolled", fr: "Inscrite" },
};

/** Error codes returned by the API, in plain words. */
export const ERROR_TEXT: Record<string, { en: string; fr: string }> = {
  required: { en: "This field is required.", fr: "Ce champ est obligatoire." },
  invalid: { en: "Please check this value.", fr: "Veuillez vérifier cette valeur." },
  too_long: { en: "This is too long.", fr: "Ce texte est trop long." },
  future: { en: "The date cannot be in the future.", fr: "La date ne peut pas être dans le futur." },
  contact_required: { en: "Give a phone number or an email.", fr: "Indiquez un téléphone ou un email." },
  file_type: { en: "Only the allowed file types, with matching content.", fr: "Seuls les types de fichiers autorisés sont acceptés." },
  file_size: { en: "A file is too large.", fr: "Un fichier est trop volumineux." },
  too_many_files: { en: "Too many files.", fr: "Trop de fichiers." },
  unknown_field: { en: "Unexpected field.", fr: "Champ inattendu." },
  contact_limit: { en: "Too many applications with this contact today. Please contact the school.", fr: "Trop de demandes avec ce contact aujourd'hui. Veuillez contacter l'école." },
  too_fast: { en: "That was very fast. Please try again.", fr: "C'était très rapide. Veuillez réessayer." },
  form_expired: { en: "The form expired. Please reload the page.", fr: "Le formulaire a expiré. Rechargez la page." },
  form_token: { en: "The form is no longer valid. Please reload the page.", fr: "Le formulaire n'est plus valide. Rechargez la page." },
};

export const FORM_TEXT = {
  en: {
    apply: "Apply for Admission",
    heroLead: "Start your child's journey with us. Fill in the form and the school will contact you.",
    joinTitle: "Join our family",
    benefits: [
      "A caring, safe and welcoming school community",
      "Dedicated teachers who know every child",
      "A simple, fully online application",
      "The school contacts you after reviewing your application",
    ],
    student: "Student Information",
    guardian: "Parent / Guardian Information",
    fullName: "Student full name",
    dob: "Date of birth",
    gender: "Gender",
    male: "Male",
    female: "Female",
    other: "Other",
    previousSchool: "Previous school",
    program: "Program of interest",
    selectClass: "Select a class",
    guardianName: "Guardian full name",
    relationship: "Relationship to the student",
    phone: "Phone number",
    email: "Email address",
    address: "Home address",
    message: "Additional message",
    documents: "Supporting documents",
    documentsHelp: (types: string, mb: number, n: number) => `Up to ${n} files (${types}), ${mb} MB each.`,
    optional: "optional",
    select: "Select",
    submit: "Submit application",
    sending: "Sending...",
    fixErrors: "Please correct the highlighted fields.",
    networkError: "We could not send your application. Check your connection and try again.",
    throttled: "Too many attempts. Please wait a while and try again.",
    thanksTitle: "Application received",
    thanksText: "Thank you. The school will contact you. Keep this reference code:",
    thanksEmail: "A confirmation was sent to your email if you gave one.",
    again: "Submit another application",
    closedTitle: "Admissions are closed",
    closedText: "The admission window is not open at the moment.",
    opens: (d: string) => `Admissions open on ${d}.`,
    closes: (d: string) => `Admissions closed on ${d}.`,
    unavailableTitle: "Online applications are not available",
    unavailableText: "Please contact the school directly.",
    intake: "Intake",
    honeypot: "Leave this field empty",
    privacy: "Your information is used only by the school to process this application.",
  },
  fr: {
    apply: "Demande d'admission",
    heroLead: "Commencez le parcours de votre enfant avec nous. Remplissez le formulaire et l'école vous contactera.",
    joinTitle: "Rejoignez notre famille",
    benefits: [
      "Une communauté scolaire bienveillante, sûre et accueillante",
      "Des enseignants dévoués qui connaissent chaque enfant",
      "Une demande simple, entièrement en ligne",
      "L'école vous contacte après examen de votre demande",
    ],
    student: "Informations sur l'élève",
    guardian: "Informations sur le parent / tuteur",
    fullName: "Nom complet de l'élève",
    dob: "Date de naissance",
    gender: "Sexe",
    male: "Masculin",
    female: "Féminin",
    other: "Autre",
    previousSchool: "École précédente",
    program: "Programme / classe souhaitée",
    selectClass: "Choisir une classe",
    guardianName: "Nom complet du tuteur",
    relationship: "Lien avec l'élève",
    phone: "Numéro de téléphone",
    email: "Adresse email",
    address: "Adresse du domicile",
    message: "Message complémentaire",
    documents: "Documents justificatifs",
    documentsHelp: (types: string, mb: number, n: number) => `Jusqu'à ${n} fichiers (${types}), ${mb} Mo chacun.`,
    optional: "facultatif",
    select: "Choisir",
    submit: "Envoyer la demande",
    sending: "Envoi...",
    fixErrors: "Veuillez corriger les champs signalés.",
    networkError: "Impossible d'envoyer votre demande. Vérifiez votre connexion et réessayez.",
    throttled: "Trop de tentatives. Patientez un moment puis réessayez.",
    thanksTitle: "Demande reçue",
    thanksText: "Merci. L'école vous contactera. Conservez ce code de référence :",
    thanksEmail: "Une confirmation a été envoyée à votre email si vous en avez indiqué un.",
    again: "Envoyer une autre demande",
    closedTitle: "Les admissions sont closes",
    closedText: "La période d'admission n'est pas ouverte actuellement.",
    opens: (d: string) => `Les admissions ouvrent le ${d}.`,
    closes: (d: string) => `Les admissions ont fermé le ${d}.`,
    unavailableTitle: "Les demandes en ligne ne sont pas disponibles",
    unavailableText: "Veuillez contacter directement l'école.",
    intake: "Rentrée",
    honeypot: "Laissez ce champ vide",
    privacy: "Vos informations sont utilisées uniquement par l'école pour traiter cette demande.",
  },
} as const;
