/**
 * Higher-education presentation of the public school site (/schools/{slug}).
 * Selected when the institution's education category is "higher" only; every
 * other category keeps the original look. Terminology overrides live here so
 * no primary/secondary wording reaches a university site.
 */
import type { PublicSchool, SchoolLang } from "@/lib/public-schools";
import { DICT } from "@/lib/school-site";

/** True for institutions whose education category is higher education only. */
export function isHigherSchool(school: Pick<PublicSchool, "levels">): boolean {
  return school.levels.includes("higher") && school.levels.every((l) => l === "higher");
}

type Dict = (typeof DICT)["en"];

const EXTRA_KEYS = [
  "atAGlance", "establishedLabel", "yearsLabel", "staffLabel", "regionLabel", "bilingualLabel", "bilingualValue",
  "exploreInstitution", "aboutMenu", "menuVision", "menuValues", "menuHistory", "menuLeadership", "menuIdentity",
  "allNews", "allEvents", "campusGallery", "readStory", "admissionsHeading", "academicsSoon",
] as const;
type ExtraKey = (typeof EXTRA_KEYS)[number];
export type SiteText = Dict & Record<ExtraKey, string>;

const HE: Record<SchoolLang, Partial<Dict> & Record<ExtraKey, string>> = {
  en: {
    about: "The Institution", gallery: "Campus life", blog: "News", login: "Portal", enrollment: "Admissions",
    discover: "Discover the institution", applyNow: "Apply now", aboutUs: "About the institution",
    ourLeadership: "Leadership", leadershipStructure: "Leadership and governance", ourTeam: "Faculty and staff",
    teamNote: "Lecturers and staff who chose to appear here.", principal: "Head of institution",
    loginTitle: "Sign in to the portal",
    loginLead: "Lecturers, students and staff sign in with the account the institution gave them.",
    loginHelp: "No account yet? Please contact the registry or admissions office.",
    eventsSoon: "This institution has not published any events yet. Check back soon.",
    gallerySoon: "This institution has not published campus photos yet. Check back soon.",
    blogSoon: "This institution has not published any news yet. Check back soon.",
    enrollmentSoon: "Online admissions are being prepared. Please contact the admissions office in the meantime.",
    schoolType: "Institution type", galleryPreview: "Campus life", latestPosts: "News and stories",
    upcomingEvents: "Events", enrollTitle: "Begin your application",
    enrollText: "Admissions are open online. Complete the application form and the admissions office will contact you.",
    notFoundTitle: "Institution website not available",
    notFoundText: "This institution website does not exist or has not been published yet.",
    atAGlance: "At a glance", establishedLabel: "Established", yearsLabel: "Years of history",
    staffLabel: "Faculty and staff listed", regionLabel: "Region", bilingualLabel: "Languages",
    bilingualValue: "English and French", exploreInstitution: "Explore the institution",
    aboutMenu: "The Institution", menuVision: "Vision and mission", menuValues: "Values", menuHistory: "History",
    menuLeadership: "Leadership", menuIdentity: "Overview", allNews: "All news", allEvents: "All events",
    campusGallery: "Visit the gallery", readStory: "Read",
    admissionsHeading: "Your place at the institution starts here", academicsSoon: "Programmes",
  },
  fr: {
    about: "L'établissement", gallery: "Vie de campus", blog: "Actualités", login: "Espace en ligne", enrollment: "Admissions",
    discover: "Découvrir l'établissement", applyNow: "Candidater", aboutUs: "À propos de l'établissement",
    ourLeadership: "Direction", leadershipStructure: "Direction et gouvernance", ourTeam: "Enseignants et personnel",
    teamNote: "Enseignants et personnel qui ont choisi d'apparaître ici.", principal: "Chef d'établissement",
    loginTitle: "Connexion à l'espace en ligne",
    loginLead: "Les enseignants, étudiants et personnels se connectent avec le compte fourni par l'établissement.",
    loginHelp: "Pas encore de compte ? Veuillez contacter la scolarité ou le bureau des admissions.",
    eventsSoon: "Cet établissement n'a pas encore publié d'événements. Revenez bientôt.",
    gallerySoon: "Cet établissement n'a pas encore publié de photos du campus. Revenez bientôt.",
    blogSoon: "Cet établissement n'a pas encore publié d'actualités. Revenez bientôt.",
    enrollmentSoon: "Les admissions en ligne sont en préparation. Contactez le bureau des admissions en attendant.",
    schoolType: "Type d'établissement", galleryPreview: "Vie de campus", latestPosts: "Actualités",
    upcomingEvents: "Événements", enrollTitle: "Commencez votre candidature",
    enrollText: "Les admissions se font en ligne. Remplissez le formulaire et le bureau des admissions vous contactera.",
    notFoundTitle: "Site de l'établissement indisponible",
    notFoundText: "Le site de cet établissement n'existe pas ou n'a pas encore été publié.",
    atAGlance: "En bref", establishedLabel: "Fondé en", yearsLabel: "Années d'histoire",
    staffLabel: "Enseignants et personnel listés", regionLabel: "Région", bilingualLabel: "Langues",
    bilingualValue: "Français et anglais", exploreInstitution: "Explorer l'établissement",
    aboutMenu: "L'établissement", menuVision: "Vision et mission", menuValues: "Valeurs", menuHistory: "Histoire",
    menuLeadership: "Direction", menuIdentity: "Présentation", allNews: "Toutes les actualités", allEvents: "Tous les événements",
    campusGallery: "Voir la galerie", readStory: "Lire",
    admissionsHeading: "Votre place dans l'établissement commence ici", academicsSoon: "Programmes",
  },
};

const BLANK = Object.fromEntries(EXTRA_KEYS.map((k) => [k, ""])) as Record<ExtraKey, string>;

/** Interface text for a school: the shared dictionary, with higher-education wording where it applies. */
export function tFor(school: Pick<PublicSchool, "levels">, lang: SchoolLang): SiteText {
  const base = { ...BLANK, ...DICT[lang] } as SiteText;
  return isHigherSchool(school) ? ({ ...base, ...HE[lang] } as SiteText) : base;
}
