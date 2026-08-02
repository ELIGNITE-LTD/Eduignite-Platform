/**
 * Bundled Translation Fallbacks for EduIgnite
 * Supports English and French (Cameroon Standard)
 * Used instantly while the backend LibreTranslate proxy fills cache.
 */

export type Language = "en" | "fr";

interface TranslationEntry {
  en: string;
  fr: string;
}

type TranslationDict = Record<string, TranslationEntry>;

// Comprehensive translation dictionary
export const OFFLINE_TRANSLATIONS: TranslationDict = {
  // Navigation
  dashboard: { en: "Dashboard", fr: "Tableau de bord" },
  students: { en: "Students", fr: "Élèves" },
  staff: { en: "Staff", fr: "Personnel" },
  teachers: { en: "Teachers", fr: "Enseignants" },
  courses: { en: "My Subjects", fr: "Mes matières" },
  grades: { en: "Report Card", fr: "Bulletin de notes" },
  attendance: { en: "Attendance", fr: "Présences" },
  schedule: { en: "Schedule", fr: "Emploi du temps" },
  schools: { en: "Schools", fr: "Écoles" },
  feedback: { en: "Feedback", fr: "Retour d'information" },
  announcements: { en: "Announcements", fr: "Annonces" },
  settings: { en: "Settings", fr: "Paramètres" },
  logout: { en: "Logout", fr: "Déconnexion" },
  
  // Authentication
  login: { en: "Login", fr: "Connexion" },
  register: { en: "Register", fr: "S'inscrire" },
  email: { en: "Email Address", fr: "Adresse e-mail" },
  password: { en: "Password", fr: "Mot de passe" },
  confirmPassword: { en: "Confirm Password", fr: "Confirmer le mot de passe" },
  signIn: { en: "Sign In", fr: "Se connecter" },
  forgotPassword: { en: "Forgot Password?", fr: "Mot de passe oublié?" },
  resetPassword: { en: "Reset Password", fr: "Réinitialiser le mot de passe" },
  
  // Academic
  academicYear: { en: "Academic Year", fr: "Année académique" },
  term: { en: "Term", fr: "Trimestre" },
  sequence: { en: "Sequence", fr: "Séquence" },
  subject: { en: "Subject", fr: "Matière" },
  subjects: { en: "Subjects", fr: "Matières" },
  grade: { en: "Grade", fr: "Note" },
  score: { en: "Score", fr: "Score" },
  marks: { en: "Marks", fr: "Points" },
  coefficient: { en: "Coefficient", fr: "Coefficient" },
  average: { en: "Average", fr: "Moyenne" },
  total: { en: "Total", fr: "Total" },
  
  // Exams
  exams: { en: "Exams", fr: "Examens" },
  exam: { en: "Exam", fr: "Examen" },
  createExam: { en: "Create Exam", fr: "Créer un examen" },
  takeExam: { en: "Take Exam", fr: "Passer l'examen" },
  examResults: { en: "Exam Results", fr: "Résultats d'examen" },
  passed: { en: "Passed", fr: "Réussi" },
  failed: { en: "Failed", fr: "Échoué" },
  duration: { en: "Duration", fr: "Durée" },
  minutes: { en: "Minutes", fr: "Minutes" },
  questions: { en: "Questions", fr: "Questions" },
  submitExam: { en: "Submit Exam", fr: "Soumettre l'examen" },
  
  // Classes
  class: { en: "Class", fr: "Classe" },
  classLevel: { en: "Class Level", fr: "Niveau de classe" },
  form: { en: "Form", fr: "Classe" },
  section: { en: "Section", fr: "Section" },
  anglophone: { en: "Anglophone", fr: "Anglophone" },
  francophone: { en: "Francophone", fr: "Francophone" },
  
  // School
  school: { en: "School", fr: "École" },
  schoolName: { en: "School Name", fr: "Nom de l'école" },
  principal: { en: "Principal", fr: "Directeur" },
  vicePrincipal: { en: "Vice Principal", fr: "Directeur adjoint" },
  
  // Students
  student: { en: "Student", fr: "Élève" },
  studentId: { en: "Student ID", fr: "Numéro d'élève" },
  matricule: { en: "Matricule", fr: "Matricule" },
  fullName: { en: "Full Name", fr: "Nom complet" },
  firstName: { en: "First Name", fr: "Prénom" },
  lastName: { en: "Last Name", fr: "Nom de famille" },
  dateOfBirth: { en: "Date of Birth", fr: "Date de naissance" },
  gender: { en: "Gender", fr: "Sexe" },
  male: { en: "Male", fr: "Masculin" },
  female: { en: "Female", fr: "Féminin" },
  
  // Guardians
  guardian: { en: "Guardian", fr: "Tuteur" },
  guardians: { en: "Guardians", fr: "Tuteurs" },
  guardianName: { en: "Guardian Name", fr: "Nom du tuteur" },
  guardianPhone: { en: "Guardian Phone", fr: "Téléphone du tuteur" },
  guardianEmail: { en: "Guardian Email", fr: "E-mail du tuteur" },
  relationship: { en: "Relationship", fr: "Relation" },
  father: { en: "Father", fr: "Père" },
  mother: { en: "Mother", fr: "Mère" },
  uncle: { en: "Uncle", fr: "Oncle" },
  aunt: { en: "Aunt", fr: "Tante" },
  
  // Staff
  staffMember: { en: "Staff Member", fr: "Membre du personnel" },
  teacher: { en: "Teacher", fr: "Enseignant" },
  formMaster: { en: "Form Master", fr: "Maître de classe" },
  headOfDepartment: { en: "Head of Department", fr: "Chef de département" },
  bursar: { en: "Bursar", fr: "Économe" },
  librarian: { en: "Librarian", fr: "Bibliothécaire" },
  counselor: { en: "Counselor", fr: "Conseiller" },
  
  // Fees
  fees: { en: "Fees", fr: "Frais" },
  fee: { en: "Fee", fr: "Frais" },
  tuitionFee: { en: "Tuition Fee", fr: "Frais de scolarité" },
  registrationFee: { en: "Registration Fee", fr: "Frais d'inscription" },
  examFee: { en: "Exam Fee", fr: "Frais d'examen" },
  ptaFee: { en: "PTA Fee", fr: "Frais PTA" },
  libraryFee: { en: "Library Fee", fr: "Frais de bibliothèque" },
  sportsFee: { en: "Sports Fee", fr: "Frais de sport" },
  transportFee: { en: "Transport Fee", fr: "Frais de transport" },
  uniformFee: { en: "Uniform Fee", fr: "Frais d'uniforme" },
  paid: { en: "Paid", fr: "Payé" },
  pending: { en: "Pending", fr: "En attente" },
  overdue: { en: "Overdue", fr: "En retard" },
  
  // Documents
  documents: { en: "Documents", fr: "Documents" },
  idCard: { en: "ID Card", fr: "Carte d'identité" },
  idCards: { en: "ID Cards", fr: "Cartes d'identité" },
  reportCard: { en: "Report Card", fr: "Bulletin de notes" },
  transcript: { en: "Transcript", fr: "Relevé de notes" },
  certificate: { en: "Certificate", fr: "Certificat" },
  receipt: { en: "Receipt", fr: "Reçu" },
  
  // Actions
  add: { en: "Add", fr: "Ajouter" },
  edit: { en: "Edit", fr: "Modifier" },
  delete: { en: "Delete", fr: "Supprimer" },
  save: { en: "Save", fr: "Enregistrer" },
  cancel: { en: "Cancel", fr: "Annuler" },
  submit: { en: "Submit", fr: "Soumettre" },
  upload: { en: "Upload", fr: "Télécharger" },
  download: { en: "Download", fr: "Télécharger" },
  print: { en: "Print", fr: "Imprimer" },
  view: { en: "View", fr: "Voir" },
  viewDetails: { en: "View Details", fr: "Voir les détails" },
  create: { en: "Create", fr: "Créer" },
  update: { en: "Update", fr: "Mettre à jour" },
  remove: { en: "Remove", fr: "Supprimer" },
  search: { en: "Search", fr: "Rechercher" },
  filter: { en: "Filter", fr: "Filtrer" },
  sort: { en: "Sort", fr: "Trier" },
  
  // Messages
  welcome: { en: "Welcome", fr: "Bienvenue" },
  welcomeBack: { en: "Welcome back", fr: "Bon retour" },
  success: { en: "Success", fr: "Succès" },
  error: { en: "Error", fr: "Erreur" },
  warning: { en: "Warning", fr: "Avertissement" },
  info: { en: "Information", fr: "Information" },
  loading: { en: "Loading...", fr: "Chargement..." },
  noData: { en: "No data available", fr: "Aucune donnée disponible" },
  noResults: { en: "No results found", fr: "Aucun résultat trouvé" },
  
  // Validation
  required: { en: "This field is required", fr: "Ce champ est obligatoire" },
  invalidEmail: { en: "Invalid email address", fr: "Adresse e-mail invalide" },
  passwordMismatch: { en: "Passwords do not match", fr: "Les mots de passe ne correspondent pas" },
  invalidCredentials: { en: "Invalid credentials", fr: "Identifiants invalides" },
  
  // Attendance
  present: { en: "Present", fr: "Présent" },
  absent: { en: "Absent", fr: "Absent" },
  late: { en: "Late", fr: "Retard" },
  excused: { en: "Excused", fr: "Excusé" },
  attendanceRate: { en: "Attendance Rate", fr: "Taux de présence" },
  
  // Profile
  profile: { en: "Profile", fr: "Profil" },
  editProfile: { en: "Edit Profile", fr: "Modifier le profil" },
  personalInfo: { en: "Personal Information", fr: "Informations personnelles" },
  contactInfo: { en: "Contact Information", fr: "Informations de contact" },
  changePassword: { en: "Change Password", fr: "Changer le mot de passe" },
  currentPassword: { en: "Current Password", fr: "Mot de passe actuel" },
  newPassword: { en: "New Password", fr: "Nouveau mot de passe" },
  
  // Platform
  platform: { en: "Platform", fr: "Plateforme" },
  platformSettings: { en: "Platform Settings", fr: "Paramètres de la plateforme" },
  schoolSettings: { en: "School Settings", fr: "Paramètres de l'école" },
  language: { en: "Language", fr: "Langue" },
  theme: { en: "Theme", fr: "Thème" },
  light: { en: "Light", fr: "Clair" },
  dark: { en: "Dark", fr: "Sombre" },
  
  // Roles
  admin: { en: "Administrator", fr: "Administrateur" },
  superAdmin: { en: "Super Administrator", fr: "Super Administrateur" },
  schoolAdmin: { en: "School Administrator", fr: "Administrateur scolaire" },
  ceo: { en: "CEO", fr: "PDG" },
  coo: { en: "COO", fr: "Directeur d'exploitation" },
  cto: { en: "CTO", fr: "Directeur technique" },
  investor: { en: "Investor", fr: "Investisseur" },
  designer: { en: "Designer", fr: "Concepteur" },
  
  // Community
  community: { en: "Community", fr: "Communauté" },
  communityPortal: { en: "Community Portal", fr: "Portail communautaire" },
  appStore: { en: "App Store", fr: "Magasin d'applications" },
  testimonies: { en: "Testimonies", fr: "Témoignages" },
  testimony: { en: "Testimony", fr: "Témoignage" },
  
  // Support
  support: { en: "Support", fr: "Support" },
  helpCenter: { en: "Help Center", fr: "Centre d'aide" },
  contactUs: { en: "Contact Us", fr: "Nous contacter" },
  liveChat: { en: "Live Chat", fr: "Chat en direct" },
  phone: { en: "Phone", fr: "Téléphone" },
  
  // Date/Time
  today: { en: "Today", fr: "Aujourd'hui" },
  tomorrow: { en: "Tomorrow", fr: "Demain" },
  yesterday: { en: "Yesterday", fr: "Hier" },
  date: { en: "Date", fr: "Date" },
  time: { en: "Time", fr: "Heure" },
  startDate: { en: "Start Date", fr: "Date de début" },
  endDate: { en: "End Date", fr: "Date de fin" },
  dueDate: { en: "Due Date", fr: "Date d'échéance" },
  
  // Status
  active: { en: "Active", fr: "Actif" },
  inactive: { en: "Inactive", fr: "Inactif" },
  completed: { en: "Completed", fr: "Terminé" },
  inProgress: { en: "In Progress", fr: "En cours" },
  draft: { en: "Draft", fr: "Brouillon" },
  published: { en: "Published", fr: "Publié" },
  archived: { en: "Archived", fr: "Archivé" },
  
  // Permissions
  permissionDenied: { en: "Permission Denied", fr: "Permission refusée" },
  notAuthorized: { en: "You are not authorized to perform this action", fr: "Vous n'êtes pas autorisé à effectuer cette action" },
  accessDenied: { en: "Access Denied", fr: "Accès refusé" },
  
  // Error messages
  networkError: { en: "Network error", fr: "Erreur réseau" },
  serverError: { en: "Server error", fr: "Erreur serveur" },
  notFound: { en: "Not found", fr: "Non trouvé" },
  unauthorized: { en: "Unauthorized", fr: "Non autorisé" },
  forbidden: { en: "Forbidden", fr: "Interdit" },
  badRequest: { en: "Bad request", fr: "Mauvaise requête" },
  
  // Feedback
  sendFeedback: { en: "Send Feedback", fr: "Envoyer un retour" },
  feedbackSent: { en: "Feedback sent successfully", fr: "Retour envoyé avec succès" },
  feedbackError: { en: "Failed to send feedback", fr: "Impossible d'envoyer le retour" },
  
  // Reports
  annualReport: { en: "Annual Report", fr: "Rapport annuel" },
  feeReport: { en: "Fee Report", fr: "Rapport sur les frais" },
  attendanceReport: { en: "Attendance Report", fr: "Rapport de présence" },
  academicReport: { en: "Academic Report", fr: "Rapport académique" },
  
  // Misc
  logo: { en: "Logo", fr: "Logo" },
  favicon: { en: "Favicon", fr: "Favicon" },
  image: { en: "Image", fr: "Image" },
  video: { en: "Video", fr: "Vidéo" },
  file: { en: "File", fr: "Fichier" },
  media: { en: "Media", fr: "Médias" },
  testimonials: { en: "Testimonials", fr: "Témoignages" },
  whatSchoolsSay: { en: "What Schools Say", fr: "Ce que disent les écoles" },
  shareYourStory: { en: "Share Your Story", fr: "Partager votre histoire" },
  publishedApps: { en: "Published Apps", fr: "Applications publiées" },
  uploadApp: { en: "Upload App", fr: "Téléverser une application" },
  publish: { en: "Publish", fr: "Publier" },
  unpublish: { en: "Unpublish", fr: "Dépublier" },
  downloadAnnualReport: { en: "Download Annual Report (PDF)", fr: "Télécharger le rapport annuel (PDF)" },
  structureHierarchy: { en: "Structure & Hierarchy", fr: "Structure et hiérarchie" },
  addGuardian: { en: "Add Guardian", fr: "Ajouter un tuteur" },
  annualLicense: { en: "Annual License", fr: "Licence annuelle" },
  pageNotFound: { en: "Page Not Found", fr: "Page introuvable" },
  goToDashboard: { en: "Go to Dashboard", fr: "Aller au tableau de bord" },
  goHome: { en: "Go Home", fr: "Accueil" },
};

/**
 * Translate a key using the offline translation dictionary
 */
export function translateKey(key: string, language: Language = "en"): string {
  const entry = OFFLINE_TRANSLATIONS[key];
  if (entry && entry[language]) {
    return entry[language];
  }
  return key; // Return key if translation not found
}

/**
 * Translate text that might be a key or a backend message
 */
export function translateText(text: string | null | undefined, language: Language = "en"): string {
  if (!text) return "";
  
  const normalized = text.trim().toLowerCase();
  
  // Try to find in translations
  for (const [key, entry] of Object.entries(OFFLINE_TRANSLATIONS)) {
    if (key === normalized || entry[language]?.toLowerCase() === normalized) {
      return entry[language];
    }
  }
  
  // Return original text if no translation found
  return text;
}

/**
 * Get all available languages
 */
export function getAvailableLanguages(): Array<{ code: Language; name: string }> {
  return [
    { code: "en", name: "English" },
    { code: "fr", name: "Français" },
  ];
}

/**
 * Add custom translation
 */
export function addCustomTranslation(key: string, en: string, fr: string): void {
  OFFLINE_TRANSLATIONS[key] = { en, fr };
}

/**
 * Get translation dictionary for a specific language
 */
export function getTranslationDictionary(language: Language): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const [key, entry] of Object.entries(OFFLINE_TRANSLATIONS)) {
    dict[key] = entry[language];
  }
  return dict;
}
