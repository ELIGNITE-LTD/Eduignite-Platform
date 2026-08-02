"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  OFFLINE_TRANSLATIONS,
  translateText as translateOfflineText,
  type Language,
} from "./offline-translations";
import { translationService } from "@/lib/api/services/translation.service";

export type { Language } from "./offline-translations";

interface TranslationEntry {
  en: string;
  fr: string;
}

type TranslationDict = Record<string, TranslationEntry>;

/**
 * Bundled fallback dictionary plus backend provider translation.
 * Runtime translations are served through the backend LibreTranslate proxy.
 * Supports: English (en) and French (fr)
 */
const translations: TranslationDict = {
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
  aiAssistant: { en: "AI Assistant", fr: "Assistant IA" },
  aiFeedback: { en: "Feedback", fr: "Feedback" },

  // Authentication
  login: { en: "Login", fr: "Connexion" },
  register: { en: "Register", fr: "S'inscrire" },
  email: { en: "Email Address", fr: "Adresse e-mail" },
  password: { en: "Password", fr: "Mot de passe" },
  confirmPassword: { en: "Confirm Password", fr: "Confirmer le mot de passe" },
  confirmPasswordLabel: { en: "Confirm Password", fr: "Confirmer le mot de passe" },
  signIn: { en: "Sign In", fr: "Se connecter" },
  forgotPassword: { en: "Forgot Password?", fr: "Mot de passe oublié?" },
  resetPassword: { en: "Reset Password", fr: "Réinitialiser le mot de passe" },
  backToLogin: { en: "Back to Login", fr: "Retour à la connexion" },
  createAccount: { en: "Create Account", fr: "Créer un compte" },
  alreadyHaveAccount: { en: "Already have an account?", fr: "Déjà un compte?" },
  dontHaveAccount: { en: "Don't have an account?", fr: "Pas encore de compte?" },

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
  exams: { en: "Exams & Schedules", fr: "Examens et calendrier" },
  exam: { en: "Exam", fr: "Examen" },
  createExam: { en: "Create Exam", fr: "Créer un examen" },
  takeExam: { en: "Take Exam", fr: "Passer l'examen" },
  examResults: { en: "Exam Results", fr: "Résultats d'examen" },
  passed: { en: "Passed", fr: "Réussi" },
  failed: { en: "Failed", fr: "Échoué" },
  duration: { en: "Duration", fr: "Durée" },
  startTime: { en: "Start Time", fr: "Heure de début" },
  endTime: { en: "End Time", fr: "Heure de fin" },
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
  schoolNode: { en: "School Node", fr: "Nœud scolaire" },
  general: { en: "General", fr: "Général" },
  technical: { en: "Technical", fr: "Technique" },
  generalAnglophone: { en: "General Anglophone", fr: "Général Anglophone" },
  generalFrancophone: { en: "General Francophone", fr: "Général Francophone" },
  technicalAnglophone: { en: "Technical Anglophone", fr: "Technique Anglophone" },
  technicalFrancophone: { en: "Technical Francophone", fr: "Technique Francophone" },

  // School
  school: { en: "School", fr: "École" },
  schoolName: { en: "School Name", fr: "Nom de l'école" },
  principal: { en: "Principal", fr: "Directeur" },
  vicePrincipal: { en: "Vice Principal", fr: "Directeur adjoint" },

  // Students
  student: { en: "Student", fr: "Élève" },
  studentId: { en: "Student ID", fr: "Numéro d'élève" },
  matricule: { en: "Matricule / ID", fr: "Matricule / ID" },
  fullName: { en: "Full Name", fr: "Nom complet" },
  firstName: { en: "First Name", fr: "Prénom" },
  lastName: { en: "Last Name", fr: "Nom de famille" },
  dateOfBirth: { en: "Date of Birth", fr: "Date de naissance" },
  gender: { en: "Gender", fr: "Sexe" },
  male: { en: "Male", fr: "Masculin" },
  female: { en: "Female", fr: "Féminin" },
  myChildren: { en: "My Children", fr: "Mes enfants" },

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
  fees: { en: "Fees & Receipts", fr: "Frais et reçus" },
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
  draftTranscript: { en: "Draft Transcript", fr: "Relevé de notes provisoire" },
  certificate: { en: "Certificate", fr: "Certificat" },
  receipt: { en: "Receipt", fr: "Reçu" },
  download: { en: "Download", fr: "Télécharger" },

  // Actions
  add: { en: "Add", fr: "Ajouter" },
  edit: { en: "Edit", fr: "Modifier" },
  delete: { en: "Delete", fr: "Supprimer" },
  save: { en: "Save", fr: "Enregistrer" },
  cancel: { en: "Cancel", fr: "Annuler" },
  submit: { en: "Submit", fr: "Soumettre" },
  upload: { en: "Upload", fr: "Télécharger" },
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
  noConversations: { en: "No conversations yet", fr: "Aucune conversation pour le moment" },
  noMessages: { en: "No messages yet", fr: "Aucun message pour le moment" },
  selectContact: { en: "Select a contact to start chatting", fr: "Sélectionnez un contact pour commencer" },

  // Validation
  required: { en: "This field is required", fr: "Ce champ est obligatoire" },
  invalidEmail: { en: "Invalid email address", fr: "Adresse e-mail invalide" },
  passwordMismatch: { en: "Passwords do not match", fr: "Les mots de passe ne correspondent pas" },
  passwordsDoNotMatch: { en: "The passwords provided do not match.", fr: "Les mots de passe fournis ne correspondent pas." },
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
  updatePassword: { en: "Update Password", fr: "Mettre à jour le mot de passe" },
  changesSaved: { en: "Changes Saved", fr: "Changements enregistrés" },
  profileUpdateSuccess: { en: "Your profile has been updated successfully.", fr: "Votre profil a été mis à jour avec succès." },

  // Platform
  platform: { en: "Platform", fr: "Plateforme" },
  platformSettings: { en: "Platform Settings", fr: "Paramètres de la plateforme" },
  schoolSettings: { en: "School Settings", fr: "Paramètres de l'école" },
  language: { en: "Language", fr: "Langue" },
  workspaceLanguage: { en: "Workspace Language", fr: "Langue de l'espace" },
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
  chat: { en: "Live Chat", fr: "Chat en direct" },

  // Library
  library: { en: "Library", fr: "Bibliothèque" },
  catalog: { en: "Catalog", fr: "Catalogue" },
  borrow: { en: "Borrow Book", fr: "Emprunter" },
  borrowed: { en: "My Borrowed Books", fr: "Mes livres empruntés" },
  libraryHistory: { en: "Library History", fr: "Historique bibliothèque" },
  returnDate: { en: "Return Date", fr: "Date de retour" },
  dateBorrowed: { en: "Date Borrowed", fr: "Date d'emprunt" },
  dateReturned: { en: "Date Returned", fr: "Date de retour" },
  available: { en: "Available", fr: "Disponible" },
  searchBooks: { en: "Search for books...", fr: "Rechercher un livre..." },
  collectionReceipt: { en: "Collection Receipt", fr: "Reçu de collection" },
  collectionCode: { en: "Collection Code", fr: "Code de collection" },

  // Assignments
  assignments: { en: "Assignments", fr: "Devoirs" },
  upcoming: { en: "Upcoming", fr: "À venir" },
  due: { en: "Due", fr: "À rendre" },
  submitted: { en: "Submitted", fr: "Soumis" },
  graded: { en: "Graded", fr: "Noté" },
  submitAssignment: { en: "Submit Assignment", fr: "Rendre le devoir" },
  dueDate: { en: "Due Date", fr: "Date limite" },

  // Materials
  addSubject: { en: "Add Optional Subject", fr: "Ajouter une matière facultative" },
  viewMaterials: { en: "View Materials", fr: "Voir les supports" },
  materials: { en: "Course Materials", fr: "Supports de cours" },
  availableSubjects: { en: "Available Optional Subjects", fr: "Matières facultatives disponibles" },

  // Online Classes
  onlineClasses: { en: "Online Classes", fr: "Classes en ligne" },

  // Other
  activateAccountTitle: { en: "Activate Account", fr: "Activer le compte" },
  secureAccessPortal: { en: "Secure Access Portal", fr: "Portail d'accès sécurisé" },
  highFidelityAccessPortal: { en: "High-Fidelity Access Portal", fr: "Portail d'accès haute fidélité" },
  connectedToLiveBackend: { en: "Connected to live backend.", fr: "Connecté au backend en direct." },
  loginFailedTryAgain: { en: "Login failed. Please try again.", fr: "La connexion a échoué. Veuillez réessayer." },
  authFailed: { en: "Authentication Failed", fr: "Échec de l'authentification" },
  accountActivated: { en: "Account activated successfully.", fr: "Compte activé avec succès." },
  accountActivatedDesc: { en: "You can now sign in with your matricule and password.", fr: "Vous pouvez maintenant vous connecter avec votre matricule et votre mot de passe." },
  checkEmailForCode: { en: "Check your email for the 6-digit code.", fr: "Vérifiez votre email pour le code à 6 chiffres." },
  identifyRecord: { en: "Identify Record", fr: "Identifier le dossier" },
  verifySecurity: { en: "Verify Security", fr: "Vérifier la sécurité" },
  commitReset: { en: "Commit Reset", fr: "Valider la réinitialisation" },
  openDashboard: { en: "Open Dashboard", fr: "Ouvrir le tableau de bord" },
  activating: { en: "Activating...", fr: "Activation..." },
  authenticating: { en: "Authenticating...", fr: "Authentification..." },
  processing: { en: "Processing...", fr: "Traitement..." },
  activateAccountCta: { en: "Activate Account", fr: "Activer le compte" },
  verifiedCorporateEmail: { en: "Verified Corporate Email", fr: "Email professionnel vérifié" },
  sixDigitVerificationCode: { en: "6-Digit Verification Code", fr: "Code de vérification à 6 chiffres" },
  codeExpires: { en: "Code expires in 05:00", fr: "Le code expire dans 05:00" },
  identityVerified: { en: "Identity Verified", fr: "Identité vérifiée" },
  resetIdentityDesc: { en: "Your account has been identified. Please define your new secure credentials below.", fr: "Votre compte a été identifié. Veuillez définir vos nouveaux identifiants sécurisés ci-dessous." },
  newSecurePassword: { en: "New Secure Password", fr: "Nouveau mot de passe sécurisé" },
  confirmNewPasswordLabel: { en: "Confirm New Password", fr: "Confirmer le nouveau mot de passe" },
  credentialsUpdated: { en: "Credentials Updated", fr: "Identifiants mis à jour" },
  credentialsUpdatedDesc: { en: "Your identity records have been synchronized. You may now proceed to sign in with your updated credentials.", fr: "Vos informations d'identité ont été synchronisées. Vous pouvez maintenant vous connecter avec vos identifiants mis à jour." },
  returnToSignIn: { en: "Return to Secure Sign In", fr: "Retour à la connexion sécurisée" },
  visitCommunityPortal: { en: "Visit Community Portal", fr: "Visiter le portail communautaire" },
  addSchool: { en: "Add School", fr: "Ajouter une école" },
  viewMap: { en: "View Map", fr: "Voir la carte" },
  sendAnnouncement: { en: "Send Announcement", fr: "Envoyer une annonce" },
  allSchools: { en: "All Schools", fr: "Toutes les écoles" },
  founders: { en: "Founders", fr: "Fondateurs" },
  supportRegistry: { en: "Support Ledger", fr: "Registre de soutien" },
  verificationId: { en: "Verification ID", fr: "ID de vérification" },
  enterOtp: { en: "Enter OTP Code", fr: "Entrer le code OTP" },
  verifyOtp: { en: "Verify Code", fr: "Vérifier le code" },
  otpSent: { en: "A 6-digit code was sent to your email.", fr: "Un code à 6 chiffres a été envoyé à votre email." },
  confirmNewPassword: { en: "Confirm New Password", fr: "Confirmer le nouveau mot de passe" },
  platformOverview: { en: "Platform Overview", fr: "Aperçu de la plateforme" },
  overview: { en: "Overview", fr: "Vue d'ensemble" },
  selectRole: { en: "Select your role", fr: "Sélectionnez votre rôle" },
};

/**
 * Backend error and status message translations
 */
const backendTextTranslations: TranslationDict = {
  "network error": { en: "Network error", fr: "Erreur réseau" },
  "invalid credentials": { en: "Invalid credentials", fr: "Identifiants invalides" },
  "wrong password": { en: "Wrong password", fr: "Mot de passe incorrect" },
  "matricule does not exist": { en: "Matricule does not exist", fr: "Le matricule n'existe pas" },
  "you are not allowed to carry out this operation": {
    en: "You are not allowed to carry out this operation",
    fr: "Vous n'êtes pas autorisé à effectuer cette opération",
  },
  "failed to load conversations": { en: "Failed to load conversations", fr: "Impossible de charger les conversations" },
  "failed to load messages": { en: "Failed to load messages", fr: "Impossible de charger les messages" },
  "failed to send feedback": { en: "Failed to send feedback.", fr: "Impossible d'envoyer le feedback." },
  "failed to resolve feedback": { en: "Failed to resolve feedback.", fr: "Impossible de résoudre le feedback." },
  "error": { en: "Error", fr: "Erreur" },
  "feedback sent": { en: "Feedback Sent", fr: "Feedback envoyé" },
  "feedback resolved": { en: "Feedback Resolved", fr: "Feedback résolu" },
  "the platform administrator has received your message": {
    en: "The platform administrator has received your message.",
    fr: "L'administrateur de la plateforme a reçu votre message.",
  },
  "ticket has been marked as resolved": {
    en: "Ticket has been marked as resolved.",
    fr: "Le ticket a été marqué comme résolu.",
  },
  "pending": { en: "Pending", fr: "En attente" },
  "resolved": { en: "Resolved", fr: "Résolu" },
  "in progress": { en: "In Progress", fr: "En cours" },
  "technical error": { en: "Technical Error", fr: "Erreur technique" },
  "feature suggestion": { en: "Feature Suggestion", fr: "Suggestion de fonctionnalité" },
  "general appreciation": { en: "General Appreciation", fr: "Appréciation générale" },
  "billing & subscription": { en: "Billing & Subscription", fr: "Facturation et abonnement" },
  "administrative request": { en: "Administrative Request", fr: "Demande administrative" },
  "other": { en: "Other", fr: "Autre" },
  "no messages yet": { en: "No messages yet", fr: "Aucun message pour le moment" },
  "online": { en: "Online", fr: "En ligne" },
  "offline": { en: "Offline", fr: "Hors ligne" },
  "connected": { en: "Connected", fr: "Connecté" },
  "live": { en: "Live", fr: "En direct" },
  "websocket error": { en: "WebSocket Error", fr: "Erreur WebSocket" },
  "active sync": { en: "Active sync", fr: "Synchronisation active" },
  "sync pending": { en: "Sync pending", fr: "Synchronisation en attente" },
  "group sync active": { en: "Group sync active", fr: "Synchronisation du groupe active" },
};

const literalTextTranslations: TranslationDict = {
  english: { en: "English", fr: "Anglais" },
  french: { en: "French", fr: "Français" },
  changeLanguage: { en: "Change language", fr: "Changer la langue" },
  communityHome: { en: "Community", fr: "Communauté" },
  strategicLogs: { en: "Strategic Logs", fr: "Journaux stratégiques" },
  allStrategicLogs: { en: "All Existing Strategic Logs", fr: "Tous les journaux stratégiques existants" },
  highlights: { en: "Highlights", fr: "Temps forts" },
  institutionalHighlights: { en: "Institutional Highlights", fr: "Temps forts institutionnels" },
  allInstitutionalHighlights: { en: "All Institutional Highlights", fr: "Tous les temps forts institutionnels" },
  contact: { en: "Contact", fr: "Contact" },
  portalLogin: { en: "Portal Login", fr: "Connexion au portail" },
  back: { en: "Back", fr: "Retour" },
  previous: { en: "Previous", fr: "Précédent" },
  next: { en: "Next", fr: "Suivant" },
  searchApps: { en: "Search apps", fr: "Rechercher des applications" },
  downloadOfficialApps: {
    en: "Download official EduIgnite mobile and desktop tools approved for Cameroon secondary schools.",
    fr: "Téléchargez les outils mobiles et bureau officiels d'EduIgnite approuvés pour les établissements secondaires du Cameroun.",
  },
  publishedEducationApps: { en: "PUBLISHED EDUCATION APPS", fr: "APPLICATIONS ÉDUCATIVES PUBLIÉES" },
  loadingPublishedApps: { en: "Loading published apps...", fr: "Chargement des applications publiées..." },
  noPublishedAppsMatch: {
    en: "No published apps match this search.",
    fr: "Aucune application publiée ne correspond à cette recherche.",
  },
  officialEduigniteApplication: {
    en: "Official EduIgnite application for school operations.",
    fr: "Application officielle EduIgnite pour les opérations scolaires.",
  },
  communityArchive: { en: "COMMUNITY ARCHIVE", fr: "ARCHIVES COMMUNAUTAIRES" },
  officialBoardArchive: { en: "OFFICIAL BOARD ARCHIVE", fr: "ARCHIVES OFFICIELLES DU CONSEIL" },
  official: { en: "OFFICIAL", fr: "OFFICIEL" },
  videoUpper: { en: "VIDEO", fr: "VIDÉO" },
  photoUpper: { en: "PHOTO", fr: "PHOTO" },
  noHighlightsPublished: {
    en: "No institutional highlights have been published yet.",
    fr: "Aucun temps fort institutionnel n'a encore été publié.",
  },
  noStrategicLogsPublished: {
    en: "No strategic logs have been published yet.",
    fr: "Aucun journal stratégique n'a encore été publié.",
  },
  openLog: { en: "Open Log", fr: "Ouvrir le journal" },
  platformUpdate: { en: "Platform Update", fr: "Mise à jour de la plateforme" },
  eduigniteBoard: { en: "EduIgnite Board", fr: "Conseil EduIgnite" },
  executive: { en: "Executive", fr: "Direction" },
  approvedTestimonialsUpper: { en: "APPROVED TESTIMONIALS", fr: "TÉMOIGNAGES APPROUVÉS" },
  whatSchoolsSay: { en: "What Schools Say", fr: "Ce que disent les écoles" },
  schoolStoriesIntro: {
    en: "Stories from school leaders, staff, parents, and students using EduIgnite.",
    fr: "Des témoignages de dirigeants scolaires, du personnel, des parents et des élèves qui utilisent EduIgnite.",
  },
  loginRequired: { en: "Login required", fr: "Connexion requise" },
  loginBeforeStory: {
    en: "Please sign in before sharing a school story.",
    fr: "Veuillez vous connecter avant de partager l'histoire de votre établissement.",
  },
  storySubmitted: { en: "Story submitted", fr: "Témoignage envoyé" },
  storyPendingReview: {
    en: "Your story is pending review by the EduIgnite team.",
    fr: "Votre témoignage est en attente de validation par l'équipe EduIgnite.",
  },
  submissionFailed: { en: "Submission failed", fr: "Échec de l'envoi" },
  couldNotSubmitStory: {
    en: "We could not submit your story.",
    fr: "Nous n'avons pas pu envoyer votre témoignage.",
  },
  loadingTestimonials: { en: "Loading testimonials...", fr: "Chargement des témoignages..." },
  eduigniteCommunityMember: { en: "EduIgnite Community Member", fr: "Membre de la communauté EduIgnite" },
  schoolVoice: { en: "School Voice", fr: "Voix scolaire" },
  showLess: { en: "Show less", fr: "Afficher moins" },
  readMore: { en: "Read more", fr: "Lire plus" },
  submitStory: { en: "Submit Story", fr: "Envoyer le témoignage" },
  submitting: { en: "Submitting...", fr: "Envoi..." },
  yourRole: { en: "Your Role", fr: "Votre rôle" },
  testimonial: { en: "Testimonial", fr: "Témoignage" },
  nationalInstitutionalNetwork: { en: "National Institutional Network", fr: "Réseau institutionnel national" },
  fuelingFuture: { en: "Fueling the Future of", fr: "Propulser l'avenir de" },
  education: { en: "Education", fr: "l'éducation" },
  communityHeroCopy: {
    en: "High-fidelity pedagogical management. Witness how our digital nodes are empowering schools, teachers, and students across the nation.",
    fr: "Une gestion pédagogique de haute précision. Découvrez comment nos pôles numériques renforcent les écoles, les enseignants et les élèves dans tout le pays.",
  },
  joinTheNetwork: { en: "Join the Network", fr: "Rejoindre le réseau" },
  readStrategicLogs: { en: "Read Strategic Logs", fr: "Lire les journaux stratégiques" },
  founderInsights: { en: "Founder's Insights", fr: "Perspectives du fondateur" },
  strategicPlatformLogs: { en: "Strategic Platform Logs", fr: "Journaux stratégiques de la plateforme" },
  leadershipBoardUpdates: {
    en: "Direct updates and vision statements from the EduIgnite leadership board.",
    fr: "Mises à jour directes et orientations de vision du conseil de direction EduIgnite.",
  },
  seeAllStrategicLogs: { en: "See All Strategic Logs", fr: "Voir tous les journaux stratégiques" },
  momentum: { en: "Momentum", fr: "Élan" },
  academicEvolutionMoments: {
    en: "Capturing the moments that define our academic evolution.",
    fr: "Capturer les moments qui définissent notre évolution académique.",
  },
  seeAllInstitutionalHighlights: {
    en: "See All Institutional Highlights",
    fr: "Voir tous les temps forts institutionnels",
  },
  voicesOfImpact: { en: "Voices of Impact", fr: "Voix d'impact" },
  communityProof: { en: "Community Proof", fr: "Preuve communautaire" },
  communityProofCopy: {
    en: "Verified feedback from school administrators, educators, parents, and learners.",
    fr: "Retours vérifiés d'administrateurs scolaires, d'enseignants, de parents et d'apprenants.",
  },
  activateYourNode: { en: "Activate Your Node", fr: "Activez votre établissement" },
  authorizedLead: { en: "Authorized Lead", fr: "Responsable autorisé" },
  fullIdentityName: { en: "Full Identity Name", fr: "Nom complet d'identité" },
  professionalRole: { en: "Professional Role", fr: "Rôle professionnel" },
  officialEmail: { en: "Official Email", fr: "E-mail officiel" },
  whatsappLine: { en: "WhatsApp Line", fr: "Ligne WhatsApp" },
  institutionalNode: { en: "Institutional Node", fr: "Établissement institutionnel" },
  officialSchoolLabel: { en: "Official School Label", fr: "Nom officiel de l'établissement" },
  region: { en: "Region", fr: "Région" },
  division: { en: "Division", fr: "Département" },
  subDiv: { en: "Sub-Div", fr: "Arrondissement" },
  encryptedOnboardingProtocol: {
    en: "Encrypted Onboarding Protocol",
    fr: "Protocole d'intégration chiffré",
  },
  togetherForPedagogicalExcellence: {
    en: "Together for pedagogical excellence",
    fr: "Ensemble pour l'excellence pédagogique",
  },
  communityVoice: { en: "Community Voice", fr: "Voix de la communauté" },
  verifiedInstitutionalTestimony: {
    en: "Verified institutional testimony.",
    fr: "Témoignage institutionnel vérifié.",
  },
  verified: { en: "Verified", fr: "Vérifié" },
  closeDossier: { en: "Close Dossier", fr: "Fermer le dossier" },
  strategicNodeAudit: { en: "Strategic Node Audit", fr: "Audit du pôle stratégique" },
  officialBoardRecord: { en: "Official Board Record", fr: "Document officiel du conseil" },
  strategicUpdateMedia: { en: "Strategic update media", fr: "Média de mise à jour stratégique" },
  verifiedLogIntegrity: { en: "Verified Log Integrity", fr: "Intégrité du journal vérifiée" },
  joinRegionalNodeNetwork: {
    en: "Join the Regional Node Network",
    fr: "Rejoindre le réseau régional d'établissements",
  },
  addAcademicYearHelp: {
    en: "Add a new academic year to the system",
    fr: "Ajoutez une nouvelle année scolaire au système",
  },
  addTermHelp: {
    en: "Add a new term to an academic year",
    fr: "Ajoutez un nouveau trimestre à une année scolaire",
  },
  chooseAcademicYear: { en: "Choose an academic year", fr: "Choisir une année scolaire" },
  firstTerm: { en: "First Term", fr: "Premier trimestre" },
  secondTerm: { en: "Second Term", fr: "Deuxième trimestre" },
  thirdTerm: { en: "Third Term", fr: "Troisième trimestre" },
  askAssistantPlaceholder: {
    en: "Ask about your subjects, grades, attendance, or platform tools...",
    fr: "Posez une question sur vos matières, notes, présences ou outils de la plateforme...",
  },
  aiFeedbackIntro: {
    en: "Generate personalized, constructive feedback based on student data.",
    fr: "Générez des appréciations personnalisées et constructives à partir des données de l'élève.",
  },
  studentDataInput: { en: "Student Data Input", fr: "Données de l'élève" },
  aiStudentDataHelp: {
    en: "Fill in the details to help the AI understand the student's performance.",
    fr: "Renseignez les détails pour aider l'IA à comprendre les performances de l'élève.",
  },
  studentName: { en: "Student Name", fr: "Nom de l'élève" },
  className: { en: "Class Name", fr: "Nom de la classe" },
  recentAssignments: { en: "Recent Assignments", fr: "Devoirs récents" },
  assignment: { en: "Assignment", fr: "Devoir" },
  max: { en: "Max", fr: "Maximum" },
  attendancePercent: { en: "Attendance (%)", fr: "Présence (%)" },
  additionalContext: { en: "Additional Context", fr: "Contexte supplémentaire" },
  aiResult: { en: "AI Result", fr: "Résultat IA" },
  aiDraftHelp: {
    en: "The generated draft will appear here for you to review and send.",
    fr: "Le brouillon généré apparaîtra ici pour relecture et envoi.",
  },
  copyOrSend: {
    en: "You can copy this text or send it directly to the student portal.",
    fr: "Vous pouvez copier ce texte ou l'envoyer directement au portail élève.",
  },
  inputStudentDetails: {
    en: "Input student details and click generate to see AI magic.",
    fr: "Renseignez les détails de l'élève puis cliquez sur générer pour voir le résultat de l'IA.",
  },
  broadcast: { en: "Broadcast", fr: "Diffusion" },
  broadcastIntro: {
    en: "Strategic platform messaging suite.",
    fr: "Suite de messagerie stratégique de la plateforme.",
  },
  recipientTarget: { en: "Recipient Target", fr: "Cible des destinataires" },
  boardChannels: { en: "Board Channels", fr: "Canaux du conseil" },
  executiveBoard: { en: "Executive Board", fr: "Conseil exécutif" },
  platformStaff: { en: "Platform Staff", fr: "Personnel de la plateforme" },
  partnersInvestors: { en: "Partners & Investors", fr: "Partenaires et investisseurs" },
  schoolScope: { en: "School Scope", fr: "Périmètre scolaire" },
  allSchoolMembers: { en: "All School Members", fr: "Tous les membres de l'établissement" },
  allTeachers: { en: "All Teachers", fr: "Tous les enseignants" },
  allStudents: { en: "All Students", fr: "Tous les élèves" },
  parents: { en: "Parents", fr: "Parents" },
  scope: { en: "Scope", fr: "Périmètre" },
  allSchoolWide: { en: "All (School-wide)", fr: "Tous (tout l'établissement)" },
  title: { en: "Title", fr: "Titre" },
  content: { en: "Content", fr: "Contenu" },
  messageBody: { en: "Message body...", fr: "Corps du message..." },
  failedLoadAnnouncements: {
    en: "Failed to load announcements.",
    fr: "Impossible de charger les annonces.",
  },
  uploadPublishManageApps: {
    en: "Upload, publish, and manage official application releases.",
    fr: "Téléversez, publiez et gérez les versions officielles des applications.",
  },
  all: { en: "All", fr: "Tous" },
  appName: { en: "App Name", fr: "Nom de l'application" },
  shortDescription: { en: "Short Description", fr: "Description courte" },
  fullDescription: { en: "Full Description", fr: "Description complète" },
  downloadUrl: { en: "Download URL", fr: "URL de téléchargement" },
  youtubeVimeoLink: { en: "YouTube/Vimeo Link", fr: "Lien YouTube/Vimeo" },
  apkPackageUpload: { en: "APK / Package Upload", fr: "Téléversement APK / paquet" },
  syncTaskDossier: { en: "Syncing Task Dossier", fr: "Synchronisation du dossier de devoir" },
  assignmentNotFound: { en: "Assignment not found.", fr: "Devoir introuvable." },
  submitYourWork: { en: "Submit Your Work", fr: "Soumettez votre travail" },
  submissionRequirements: {
    en: "Follow the institutional requirements for this task.",
    fr: "Respectez les exigences institutionnelles de ce devoir.",
  },
  workRecorded: { en: "Work Successfully Recorded", fr: "Travail enregistré avec succès" },
  responseReadyReview: {
    en: "Your response is stored and ready for review.",
    fr: "Votre réponse est enregistrée et prête pour la correction.",
  },
  pedagogicalIntegrityVerified: {
    en: "Pedagogical Integrity Verified",
    fr: "Intégrité pédagogique vérifiée",
  },
  assignmentRegistry: { en: "Assignment Registry", fr: "Registre des devoirs" },
  submissionDeadline: { en: "Submission Deadline", fr: "Date limite de soumission" },
  standardInstitutionalWindow: {
    en: "Standard Institutional Window",
    fr: "Fenêtre institutionnelle standard",
  },
  pedagogicalWeight: { en: "Pedagogical Weight", fr: "Poids pédagogique" },
  institutionalEvaluationCycle: {
    en: "Institutional Evaluation Cycle",
    fr: "Cycle d'évaluation institutionnel",
  },
  digitalIdReference: { en: "Digital ID Reference", fr: "Référence d'identité numérique" },
  submissionNotice: { en: "Submission Notice", fr: "Avis de soumission" },
  open: { en: "Open", fr: "Ouvert" },
  pendingGrade: { en: "Pending Grade", fr: "Note en attente" },
  missed: { en: "Missed", fr: "Manqué" },
  cancelled: { en: "Cancelled", fr: "Annulé" },
  officialSubmissionsPortal: {
    en: "Official portal for academic submissions and pedagogical tasks.",
    fr: "Portail officiel des soumissions académiques et des devoirs pédagogiques.",
  },
  noActiveAssignments: {
    en: "No active assignments found for your class.",
    fr: "Aucun devoir actif trouvé pour votre classe.",
  },
  noSubmittedWork: {
    en: "You haven't submitted any work yet.",
    fr: "Vous n'avez encore soumis aucun travail.",
  },
  taskTitle: { en: "Task Title", fr: "Titre du devoir" },
  course: { en: "Course", fr: "Cours" },
  submissionDossier: { en: "Submission Dossier", fr: "Dossier de soumission" },
  submissionTimestamp: { en: "Submission Timestamp", fr: "Horodatage de soumission" },
  dossierStatus: { en: "Dossier Status", fr: "Statut du dossier" },
  finalPedagogicalScore: { en: "Final Pedagogical Score", fr: "Note pédagogique finale" },
  integrity: { en: "Integrity", fr: "Intégrité" },
  digitallySigned: { en: "DIGITALLY SIGNED", fr: "SIGNÉ NUMÉRIQUEMENT" },
  submittedResponse: { en: "Submitted Response", fr: "Réponse soumise" },
  attachedDocumentation: { en: "Attached Documentation", fr: "Documents joints" },
  manageTasksGrading: {
    en: "Manage institutional tasks and grading workflows.",
    fr: "Gérez les devoirs institutionnels et les flux de notation.",
  },
  maxMarks: { en: "Max Marks", fr: "Note maximale" },
  setupNewTask: { en: "Setup New Task", fr: "Configurer un nouveau devoir" },
  assignmentTitle: { en: "Assignment Title", fr: "Titre du devoir" },
  selectSubject: { en: "Select Subject", fr: "Sélectionner une matière" },
  targetClass: { en: "Target Class", fr: "Classe cible" },
  instructions: { en: "Instructions", fr: "Consignes" },
  guidelinesForStudents: { en: "Guidelines for students...", fr: "Consignes pour les élèves..." },
  submissionRegistry: { en: "Submission Registry", fr: "Registre des soumissions" },
  studentProfile: { en: "Student Profile", fr: "Profil de l'élève" },
  timestamp: { en: "Timestamp", fr: "Horodatage" },
  actions: { en: "Actions", fr: "Actions" },
  highFidelityGradingAudit: {
    en: "High-fidelity grading audit active.",
    fr: "Audit de notation haute fidélité actif.",
  },
  closeQueue: { en: "Close Queue", fr: "Fermer la file" },
  reviewSubmission: { en: "Review Submission", fr: "Examiner la soumission" },
  studentResponse: { en: "Student Response", fr: "Réponse de l'élève" },
  attachedFile: { en: "Attached File", fr: "Fichier joint" },
  assignScore: { en: "Assign Score", fr: "Attribuer une note" },
  optionalGradingFeedback: {
    en: "Optional grading feedback...",
    fr: "Appréciation optionnelle...",
  },
  verifiedScore: { en: "Verified Score", fr: "Note vérifiée" },
  deadline: { en: "Deadline", fr: "Date limite" },
  textFile: { en: "Text & File", fr: "Texte et fichier" },
  fileOnly: { en: "File Only", fr: "Fichier uniquement" },
  textResponse: { en: "Text Response", fr: "Réponse texte" },
  failedLoadAttendance: { en: "Failed to Load Attendance", fr: "Impossible de charger les présences" },
  pleaseTryAgain: { en: "Please try again.", fr: "Veuillez réessayer." },
  myAttendance: { en: "My Attendance", fr: "Mes présences" },
  attendanceRecordIntro: {
    en: "View your attendance record and percentage.",
    fr: "Consultez votre registre de présence et votre pourcentage.",
  },
  totalSessions: { en: "Total Sessions", fr: "Nombre total de séances" },
  attendanceHistory: { en: "Attendance History", fr: "Historique de présence" },
  noAttendanceRecords: { en: "No attendance records yet", fr: "Aucun registre de présence pour le moment" },
  markAttendance: { en: "Mark Attendance", fr: "Marquer les présences" },
  recordAttendanceIntro: {
    en: "Record student attendance for your classes.",
    fr: "Enregistrez les présences des élèves pour vos classes.",
  },
  chooseClass: { en: "Choose class...", fr: "Choisir une classe..." },
  chooseSubject: { en: "Choose subject...", fr: "Choisir une matière..." },
  recentSessions: { en: "Recent Sessions", fr: "Séances récentes" },
  noAttendanceSessions: { en: "No attendance sessions yet", fr: "Aucune séance de présence pour le moment" },
  attendanceManagement: { en: "Attendance Management", fr: "Gestion des présences" },
  monitorAttendance: {
    en: "Monitor attendance across all classes.",
    fr: "Suivez les présences dans toutes les classes.",
  },
  generateClassReport: { en: "Generate Class Report", fr: "Générer un rapport de classe" },
  fromDate: { en: "From Date", fr: "Date de début" },
  toDate: { en: "To Date", fr: "Date de fin" },
  reportResults: { en: "Report Results", fr: "Résultats du rapport" },
  percentage: { en: "Percentage", fr: "Pourcentage" },
  allAttendanceRecords: { en: "All Attendance Records", fr: "Tous les registres de présence" },
  searchRelatedUsers: { en: "Search related users...", fr: "Rechercher des utilisateurs liés..." },
  optionalGroupName: { en: "Optional group name", fr: "Nom de groupe optionnel" },
  selectClass: { en: "Select class", fr: "Sélectionner une classe" },
  onlyAdminsCanSend: { en: "Only admins can send messages", fr: "Seuls les administrateurs peuvent envoyer des messages" },
  teachersCanSwitchLater: {
    en: "Teachers can switch this later in group settings.",
    fr: "Les enseignants pourront modifier cela plus tard dans les paramètres du groupe.",
  },
  conversationControls: {
    en: "Update conversation controls and manage group members.",
    fr: "Mettez à jour les contrôles de conversation et gérez les membres du groupe.",
  },
};

const WINDOWS_1252_BYTE_MAP: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const repairMojibake = (value: string): string => {
  if (!/[ÃÂÅâ]/.test(value) || typeof TextDecoder === "undefined") return value;

  try {
    const bytes = Array.from(value)
      .map((char) => {
        const code = char.charCodeAt(0);
        return code <= 255 ? code : WINDOWS_1252_BYTE_MAP[code];
      })
      .filter((code): code is number => typeof code === "number" && code >= 0 && code <= 255);

    if (bytes.length !== Array.from(value).length) return value;
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
    return decoded.includes("\uFFFD") ? value : decoded;
  } catch {
    return value;
  }
};

const cleanEntry = (entry: TranslationEntry): TranslationEntry => ({
  en: repairMojibake(entry.en),
  fr: repairMojibake(entry.fr),
});

const normalizeTranslationLookup = (value: string) =>
  repairMojibake(value)
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPhraseMap = () => {
  const map = new Map<string, TranslationEntry>();

  const addEntry = (key: string, entry: TranslationEntry) => {
    const clean = cleanEntry(entry);
    [key, clean.en, clean.fr].forEach((candidate) => {
      const normalized = normalizeTranslationLookup(candidate);
      if (normalized) map.set(normalized, clean);
    });
  };

  Object.entries(OFFLINE_TRANSLATIONS).forEach(([key, entry]) => addEntry(key, entry));
  Object.entries(translations).forEach(([key, entry]) => addEntry(key, entry));
  Object.entries(backendTextTranslations).forEach(([key, entry]) => addEntry(key, entry));
  Object.entries(literalTextTranslations).forEach(([key, entry]) => addEntry(key, entry));

  return map;
};

const phraseTranslations = buildPhraseMap();

const replacementPhrases = Array.from(phraseTranslations.values())
  .map(cleanEntry)
  .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.en === entry.en && candidate.fr === entry.fr) === index)
  .filter((entry) => entry.en.length >= 4 && entry.fr.length >= 4)
  .sort((left, right) => right.en.length - left.en.length);

const translateKnownText = (value: string, language: Language) => {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const leading = match?.[1] ?? "";
  const body = match?.[2] ?? value;
  const trailing = match?.[3] ?? "";
  const repairedBody = repairMojibake(body);

  if (!repairedBody.trim() || /^[\d\s.,:;/%()+-]+$/.test(repairedBody)) {
    return `${leading}${repairedBody}${trailing}`;
  }

  const normalized = normalizeTranslationLookup(repairedBody);
  const exactEntry = phraseTranslations.get(normalized);
  if (exactEntry) {
    const translated = cleanEntry(exactEntry)[language];
    const sourceEnding = repairedBody.match(/[.!?]$/)?.[0] ?? "";
    const withEnding = sourceEnding && !/[.!?]$/.test(translated) ? `${translated}${sourceEnding}` : translated;
    return `${leading}${withEnding}${trailing}`;
  }

  let translatedBody = repairedBody;
  const sourceLanguage: Language = language === "fr" ? "en" : "fr";
  for (const entry of replacementPhrases) {
    const source = entry[sourceLanguage];
    const target = entry[language];
    if (!source || !target || source === target || !translatedBody.toLowerCase().includes(source.toLowerCase())) continue;

    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(source)})(?=$|[^\\p{L}\\p{N}])`, "giu");
    translatedBody = translatedBody.replace(pattern, (_match, prefix) => `${prefix}${target}`);
  }

  return `${leading}${translatedBody}${trailing}`;
};

const UI_WORDS = new Set([
  "academic", "account", "add", "admin", "ai", "all", "analysis", "assignment", "assignments", "attendance",
  "average", "balance", "bank", "calendar", "career", "card", "cards", "class", "classes", "community",
  "dashboard", "download", "enter", "exam", "exams", "fees", "gap", "generate", "guardian", "guardians",
  "library", "marks", "my", "orientation", "parent", "parents", "payment", "question", "report", "reports",
  "rewards", "roadmap", "schedule", "school", "sequence", "sequences", "settings", "staff", "student",
  "students", "subject", "subjects", "teacher", "teachers", "term", "terms", "timetable", "total", "transcript",
  "user", "users", "year",
]);

const INSTITUTION_WORDS = new Set([
  "academy", "college", "complex", "gbhs", "gths", "high", "institute", "lycee", "lycée", "school", "secondary",
]);

const CLASS_NAME_PATTERNS = [
  /\bform\s*\d+[a-z]?\b/i,
  /\b(?:lower|upper)\s+sixth\b/i,
  /\b(?:sixth|premiere|première|terminal|terminale)\s+[a-z]+\b/i,
  /\b(?:6[eè]me|5[eè]me|4[eè]me|3[eè]me|2nde|1[eè]re|tle)\s*[a-z]?\b/i,
  /\b(?:anglophone|francophone)\s+(?:general|technical)\s+section\b/i,
  /\b(?:general|technical)\s+section\b/i,
];

const IDENTITY_PATTERNS = [
  /^[A-Z]{2,}\d{2,}[A-Z0-9-]*$/i,
  /^[A-Z]{2,}\d{2,}(?:SA|BU|LB|TE|ST|PA)\d{3,4}$/i,
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /^(?:https?:|mailto:|tel:)/i,
];

const tokenizeHumanText = (value: string) =>
  value
    .replace(/[\[\](),.:;|\/]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const isCapitalizedToken = (token: string) =>
  /^[A-ZÀ-Ý][a-zà-ÿ'’-]+$/.test(token) || /^[A-ZÀ-Ý]{2,}$/.test(token);

const shouldPreserveIdentityText = (value: string) => {
  const text = repairMojibake(value).trim();
  if (!text || text.length > 140) return false;
  if (phraseTranslations.has(normalizeTranslationLookup(text))) return false;
  if (IDENTITY_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (CLASS_NAME_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const tokens = tokenizeHumanText(text);
  if (tokens.length < 2 || tokens.length > 8) return false;
  const normalizedTokens = tokens.map((token) => token.toLowerCase());
  const uiTokenCount = normalizedTokens.filter((token) => UI_WORDS.has(token)).length;
  const specificTokenCount = normalizedTokens.filter((token) => !UI_WORDS.has(token) && token.length > 1).length;

  const looksLikeInstitution =
    normalizedTokens.some((token) => INSTITUTION_WORDS.has(token))
    && specificTokenCount > 0
    && uiTokenCount < tokens.length;
  if (looksLikeInstitution && tokens.every((token) => isCapitalizedToken(token) || /^[A-Z0-9.-]+$/.test(token))) {
    return true;
  }

  const looksLikePersonName =
    tokens.length <= 5
    && specificTokenCount >= 2
    && tokens.every((token) => isCapitalizedToken(token) || /^[A-Z]\.?$/.test(token));
  return looksLikePersonName;
};

export const LANGUAGE_STORAGE_KEY = "eduignite_lang";
const REMOTE_TRANSLATION_CACHE_KEY = "eduignite_remote_translations_v1";

type RemoteTranslationCache = Record<string, Partial<Record<Language, string>>>;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  translateText: (value?: string | null) => string;
}

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"] as const;
const ORIGINAL_ATTRIBUTE_PREFIX = "data-eduignite-i18n-original-";
const SKIP_TRANSLATION_SELECTOR =
  'script, style, noscript, svg, textarea, [contenteditable="true"], [data-eduignite-i18n-ignore="true"]';

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>("en");
  const rootRef = useRef<HTMLDivElement>(null);
  const originalTextNodes = useRef(new WeakMap<Text, string>());
  const originalDocumentTitle = useRef<string | null>(null);
  const isApplyingTranslations = useRef(false);
  const phraseMap = useMemo(() => phraseTranslations, []);
  const [remoteRevision, setRemoteRevision] = useState(0);
  const remoteTranslations = useRef<RemoteTranslationCache>({});
  const pendingRemoteTexts = useRef(new Set<string>());
  const remoteRequestTimer = useRef<number | null>(null);
  const remoteRequestInFlight = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(REMOTE_TRANSLATION_CACHE_KEY);
      if (stored) {
        remoteTranslations.current = JSON.parse(stored) as RemoteTranslationCache;
        setRemoteRevision((revision) => revision + 1);
      }
    } catch {
      remoteTranslations.current = {};
    }
  }, []);

  const getRemoteTranslation = useCallback((value: string, targetLanguage: Language) => {
    const key = normalizeTranslationLookup(value);
    return remoteTranslations.current[key]?.[targetLanguage];
  }, []);

  const applyOriginalWhitespace = useCallback((original: string, translated: string) => {
    const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return `${match?.[1] ?? ""}${translated.trim()}${match?.[3] ?? ""}`;
  }, []);

  const shouldRequestRemoteTranslation = useCallback((value: string) => {
    const repaired = repairMojibake(value).trim();
    if (language === "en" || repaired.length < 2 || repaired.length > 500) return false;
    if (/^[\d\s.,:;/%()+-]+$/.test(repaired)) return false;
    if (/^(https?:|data:|mailto:|tel:)/i.test(repaired)) return false;
    if (shouldPreserveIdentityText(repaired)) return false;
    return /[A-Za-z]/.test(repaired);
  }, [language]);

  const flushRemoteTranslations = useCallback(async (targetLanguage: Language) => {
    if (remoteRequestInFlight.current || targetLanguage === "en") return;
    const texts = Array.from(pendingRemoteTexts.current).slice(0, 80);
    pendingRemoteTexts.current.clear();
    if (!texts.length) return;

    remoteRequestInFlight.current = true;
    try {
      const response = await translationService.translateBatch(texts, targetLanguage, "en");
      let savedTranslations = 0;
      response.translations.forEach((translated, index) => {
        const original = texts[index];
        const normalized = normalizeTranslationLookup(original);
        const cleaned = repairMojibake(translated || original);
        if (!normalized || !cleaned || cleaned === original) return;
        remoteTranslations.current[normalized] = {
          ...remoteTranslations.current[normalized],
          [targetLanguage]: cleaned,
        };
        savedTranslations += 1;
      });
      if (savedTranslations > 0 && typeof window !== "undefined") {
        localStorage.setItem(REMOTE_TRANSLATION_CACHE_KEY, JSON.stringify(remoteTranslations.current));
      }
      if (savedTranslations > 0) {
        setRemoteRevision((revision) => revision + 1);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[i18n] Remote translation failed", error);
      }
    } finally {
      remoteRequestInFlight.current = false;
    }
  }, []);

  const queueRemoteTranslation = useCallback((value: string) => {
    if (!shouldRequestRemoteTranslation(value) || getRemoteTranslation(value, language)) return;
    pendingRemoteTexts.current.add(repairMojibake(value).trim());
    if (typeof window === "undefined" || remoteRequestTimer.current !== null) return;
    remoteRequestTimer.current = window.setTimeout(() => {
      remoteRequestTimer.current = null;
      void flushRemoteTranslations(language);
    }, 180);
  }, [flushRemoteTranslations, getRemoteTranslation, language, shouldRequestRemoteTranslation]);

  const translateRuntimeText = useCallback((value: string) => {
    const repaired = repairMojibake(value);
    if (language === "en" || shouldPreserveIdentityText(repaired)) return repaired;
    const remote = getRemoteTranslation(value, language);
    if (remote) return applyOriginalWhitespace(value, remote);
    const translated = translateKnownText(value, language);
    queueRemoteTranslation(value);
    return translated;
  }, [applyOriginalWhitespace, getRemoteTranslation, language, queueRemoteTranslation, remoteRevision]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedLang = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
    if (savedLang === "en" || savedLang === "fr") {
      setLanguage(savedLang);
      return;
    }
    const browserLang = navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
    setLanguage(browserLang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, browserLang);
    const legacyLang = localStorage.getItem("eduignite-language") as Language | null;
    if (legacyLang === "en" || legacyLang === "fr") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, legacyLang);
      setLanguage(legacyLang);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (typeof document === "undefined" || !rootRef.current) return;

    const root = rootRef.current;

    const translateAttribute = (element: Element, attribute: (typeof TRANSLATABLE_ATTRIBUTES)[number]) => {
      const currentValue = element.getAttribute(attribute);
      if (!currentValue) return;

      const originalAttribute = `${ORIGINAL_ATTRIBUTE_PREFIX}${attribute}`;
      const storedOriginal = element.getAttribute(originalAttribute);
      const originalValue = storedOriginal ?? currentValue;

      if (!storedOriginal && language !== "en") {
        element.setAttribute(originalAttribute, originalValue);
      }

      const translated = translateRuntimeText(originalValue);
      if (translated !== currentValue) {
        element.setAttribute(attribute, translated);
      }

      if (language === "en" && storedOriginal) {
        element.removeAttribute(originalAttribute);
      }
    };

    const translateElementAttributes = (element: Element) => {
      if (element.closest(SKIP_TRANSLATION_SELECTOR)) return;
      TRANSLATABLE_ATTRIBUTES.forEach((attribute) => translateAttribute(element, attribute));
    };

    const translateTextNode = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_TRANSLATION_SELECTOR)) return;

      const currentValue = node.textContent ?? "";
      const storedOriginal = originalTextNodes.current.get(node);
      const originalValue = storedOriginal ?? currentValue;

      if (!storedOriginal && language !== "en") {
        originalTextNodes.current.set(node, originalValue);
      }

      const translated = translateRuntimeText(originalValue);
      if (translated !== currentValue) {
        node.textContent = translated;
      }

      if (language === "en" && storedOriginal) {
        originalTextNodes.current.delete(node);
      }
    };

    const applyTranslations = () => {
      isApplyingTranslations.current = true;

      translateElementAttributes(root);

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              return element.closest(SKIP_TRANSLATION_SELECTOR)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT;
            }
            if (node.nodeType === Node.TEXT_NODE) {
              const parent = node.parentElement;
              if (!parent || parent.closest(SKIP_TRANSLATION_SELECTOR)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node as Text);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          translateElementAttributes(node as Element);
        }
        node = walker.nextNode();
      }

      if (document.title) {
        if (!originalDocumentTitle.current) originalDocumentTitle.current = document.title;
        document.title = translateRuntimeText(originalDocumentTitle.current);
      }

      isApplyingTranslations.current = false;
    };

    applyTranslations();

    let frameId: number | null = null;
    const observer = new MutationObserver(() => {
      if (isApplyingTranslations.current) return;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(applyTranslations);
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [language, phraseMap, translateRuntimeText]);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  };

  const t = (key: string) => {
    const entry = translations[key] ?? OFFLINE_TRANSLATIONS[key];
    if (entry?.[language]) return cleanEntry(entry)[language];
    if (process.env.NODE_ENV === "development") {
      console.warn(`[i18n] Missing translation key: ${key}`);
    }
    return key;
  };
  const translateText = (value?: string | null) => {
    if (!value) return "";
    const normalized = value.trim().toLowerCase().replace(/[.!?]+$/, "");
    const repaired = repairMojibake(value);
    if (shouldPreserveIdentityText(repaired)) return repaired;
    const remote = getRemoteTranslation(value, language);
    if (remote) return repairMojibake(remote);
    if (language !== "en") queueRemoteTranslation(value);
    const translated =
      backendTextTranslations[normalized]?.[language] ??
      phraseMap.get(normalizeTranslationLookup(value))?.[language] ??
      translateKnownText(translateOfflineText(value, language), language);
    const cleanedTranslation = repairMojibake(translated);
    if (cleanedTranslation === value && process.env.NODE_ENV === "development") {
      console.warn(`[i18n] Missing backend/text translation: ${value}`);
    }
    return cleanedTranslation;
  };

  return (
    <div ref={rootRef} lang={language} suppressHydrationWarning>
      <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t, translateText }}>
        {children}
      </I18nContext.Provider>
    </div>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};
