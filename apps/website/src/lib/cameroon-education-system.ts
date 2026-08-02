/**
 * Cameroonian Education System Configuration
 * Supports Francophone, Anglophone, and Bilingual subsystems
 * Supports General, Technical, and Mixed school types
 */

export type Subsystem = 'francophone' | 'anglophone' | 'bilingual';
export type SchoolType = 'general' | 'technical' | 'mixed';
export type Stream = 'general' | 'technical';

// Francophone General Education Classes
export const FRANCOPHONE_GENERAL_CLASSES = [
  { value: '6ème', label: '6ème (Form 1)', level: 1 },
  { value: '5ème', label: '5ème (Form 2)', level: 2 },
  { value: '4ème', label: '4ème (Form 3)', level: 3 },
  { value: '3ème', label: '3ème (Form 4) - BEPC', level: 4 },
  { value: 'Seconde', label: 'Seconde (Form 5)', level: 5 },
  { value: 'Première', label: 'Première (Lower Sixth)', level: 6 },
  { value: 'Terminale', label: 'Terminale (Upper Sixth) - Baccalauréat', level: 7 },
];

// Anglophone General Education Classes
export const ANGLOPHONE_GENERAL_CLASSES = [
  { value: 'Form 1', label: 'Form 1', level: 1 },
  { value: 'Form 2', label: 'Form 2', level: 2 },
  { value: 'Form 3', label: 'Form 3', level: 3 },
  { value: 'Form 4', label: 'Form 4 - GCE O/L', level: 4 },
  { value: 'Form 5', label: 'Form 5', level: 5 },
  { value: 'Lower Sixth', label: 'Lower Sixth', level: 6 },
  { value: 'Upper Sixth', label: 'Upper Sixth - GCE A/L', level: 7 },
];

// Francophone Technical Education Classes
export const FRANCOPHONE_TECHNICAL_CLASSES = [
  { value: 'CAP 1', label: 'CAP 1', level: 1 },
  { value: 'CAP 2', label: 'CAP 2 - Certificat d\'Aptitude Professionnelle', level: 2 },
  { value: 'BEP 1', label: 'BEP 1', level: 3 },
  { value: 'BEP 2', label: 'BEP 2 - Brevet d\'Études Professionnelles', level: 4 },
  { value: 'BAC TECH 1', label: 'BAC TECH 1', level: 5 },
  { value: 'BAC TECH 2', label: 'BAC TECH 2', level: 6 },
  { value: 'BAC TECH 3', label: 'BAC TECH 3 - Baccalauréat Technique', level: 7 },
];

// Anglophone Technical Education Classes
export const ANGLOPHONE_TECHNICAL_CLASSES = [
  { value: 'Level 1', label: 'Level 1', level: 1 },
  { value: 'Level 2', label: 'Level 2', level: 2 },
  { value: 'Level 3', label: 'Level 3', level: 3 },
  { value: 'Level 4', label: 'Level 4 - City & Guilds', level: 4 },
  { value: 'Level 5', label: 'Level 5', level: 5 },
  { value: 'Level 6', label: 'Level 6', level: 6 },
  { value: 'Level 7', label: 'Level 7 - Advanced', level: 7 },
];

// Francophone General Subjects
export const FRANCOPHONE_GENERAL_SUBJECTS = [
  'Français',
  'Mathématiques',
  'Sciences Physiques et Chimie',
  'Sciences de la Vie et de la Terre',
  'Histoire-Géographie',
  'Anglais',
  'Éducation Physique et Sportive',
  'Philosophie',
  'Économie',
  'Informatique',
  'Arts',
  'Musique',
  'Technologie',
];

// Anglophone General Subjects
export const ANGLOPHONE_GENERAL_SUBJECTS = [
  'English Language',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'History',
  'Geography',
  'Literature in English',
  'Physical Education',
  'Computer Science',
  'Religious Studies',
  'Economics',
  'Art',
  'Music',
];

// Technical Specialisations (Filières)
export const TECHNICAL_SPECIALISATIONS = [
  { value: 'informatique', label: 'Informatique (IT)' },
  { value: 'electronique', label: 'Électronique (Electronics)' },
  { value: 'mecanique', label: 'Mécanique Automobile (Automotive)' },
  { value: 'genie_civil', label: 'Génie Civil (Civil Engineering)' },
  { value: 'secretariat', label: 'Secrétariat-Bureautique (Secretarial)' },
  { value: 'comptabilite', label: 'Comptabilité (Accounting)' },
  { value: 'hotellerie', label: 'Hôtellerie-Restauration (Hospitality)' },
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'couture', label: 'Couture (Fashion/Tailoring)' },
  { value: 'menuiserie', label: 'Menuiserie (Carpentry)' },
  { value: 'plomberie', label: 'Plomberie (Plumbing)' },
  { value: 'electricite', label: 'Électricité (Electrical)' },
];

// Technical Subjects by Specialisation
export const TECHNICAL_SUBJECTS_BY_SPECIALISATION: Record<string, string[]> = {
  informatique: [
    'Algorithmique',
    'Programmation',
    'Réseaux',
    'Base de données',
    'Maintenance Informatique',
    'Systèmes d\'exploitation',
    'Web Design',
  ],
  electronique: [
    'Électricité Générale',
    'Électronique Analogique',
    'Électronique Numérique',
    'Circuits Intégrés',
    'Télécommunications',
    'Automatisme',
  ],
  mecanique: [
    'Mécanique Générale',
    'Moteurs',
    'Transmission',
    'Hydraulique',
    'Pneumatique',
    'Diagnostic Automobile',
  ],
  genie_civil: [
    'Dessin Technique',
    'Matériaux de Construction',
    'Résistance des Matériaux',
    'Topographie',
    'Béton Armé',
    'Charpente',
  ],
  secretariat: [
    'Dactylographie',
    'Sténographie',
    'Secrétariat Général',
    'Comptabilité Générale',
    'Droit Commercial',
    'Bureautique',
  ],
  comptabilite: [
    'Comptabilité Générale',
    'Comptabilité Analytique',
    'Fiscalité',
    'Audit',
    'Gestion Financière',
    'Informatique Comptable',
  ],
  hotellerie: [
    'Cuisine',
    'Service en Salle',
    'Réception Hôtelière',
    'Hygiène et Sécurité',
    'Gestion Hôtelière',
    'Sommellerie',
  ],
  agriculture: [
    'Agronomie',
    'Élevage',
    'Phytopathologie',
    'Pédologie',
    'Mécanisation Agricole',
    'Gestion Agricole',
  ],
  couture: [
    'Dessin de Mode',
    'Coupe et Couture',
    'Tricotage',
    'Broderie',
    'Finition',
    'Gestion de Production',
  ],
  menuiserie: [
    'Dessin Technique',
    'Sciage',
    'Rabotage',
    'Assemblage',
    'Finition',
    'Gestion du Bois',
  ],
  plomberie: [
    'Tuyauterie',
    'Sanitaires',
    'Chauffage',
    'Gaz',
    'Soudure',
    'Maintenance',
  ],
  electricite: [
    'Électricité Générale',
    'Circuits Électriques',
    'Installation Électrique',
    'Moteurs Électriques',
    'Automatisme',
    'Sécurité Électrique',
  ],
};

// Cameroon Regions
export const CAMEROON_REGIONS = [
  'Adamaoua',
  'Centre',
  'Est',
  'Extrême-Nord',
  'Littoral',
  'Nord',
  'Nord-Ouest',
  'Ouest',
  'Sud',
  'Sud-Ouest',
];

/**
 * Get class levels based on subsystem and stream
 */
export function getClassLevels(subsystem: Subsystem, stream: Stream = 'general'): Array<{ value: string; label: string; level: number }> {
  if (subsystem === 'francophone') {
    return stream === 'technical' ? FRANCOPHONE_TECHNICAL_CLASSES : FRANCOPHONE_GENERAL_CLASSES;
  } else if (subsystem === 'anglophone') {
    return stream === 'technical' ? ANGLOPHONE_TECHNICAL_CLASSES : ANGLOPHONE_GENERAL_CLASSES;
  } else {
    // Bilingual - return both
    return stream === 'technical'
      ? [...FRANCOPHONE_TECHNICAL_CLASSES, ...ANGLOPHONE_TECHNICAL_CLASSES]
      : [...FRANCOPHONE_GENERAL_CLASSES, ...ANGLOPHONE_GENERAL_CLASSES];
  }
}

/**
 * Get subjects based on subsystem, stream, and optionally specialisation
 */
export function getSubjects(
  subsystem: Subsystem,
  stream: Stream = 'general',
  specialisation?: string
): string[] {
  if (stream === 'technical' && specialisation) {
    return TECHNICAL_SUBJECTS_BY_SPECIALISATION[specialisation] || [];
  }

  if (subsystem === 'francophone') {
    return FRANCOPHONE_GENERAL_SUBJECTS;
  } else if (subsystem === 'anglophone') {
    return ANGLOPHONE_GENERAL_SUBJECTS;
  } else {
    // Bilingual - return both
    return [...FRANCOPHONE_GENERAL_SUBJECTS, ...ANGLOPHONE_GENERAL_SUBJECTS];
  }
}

/**
 * Get standard coefficient for a subject
 * NOTE: Coefficients are EDITABLE and NOT fixed
 */
export function getSubjectCoefficient(subject: string, stream: Stream = 'general'): number {
  const coefficients: Record<string, number> = {
    // Francophone
    'Français': 3,
    'Mathématiques': 4,
    'Sciences Physiques et Chimie': 3,
    'Sciences de la Vie et de la Terre': 2,
    'Histoire-Géographie': 2,
    'Anglais': 2,
    'Éducation Physique et Sportive': 1,
    'Philosophie': 2,
    'Économie': 2,
    'Informatique': 2,
    // Anglophone
    'English Language': 3,
    'Mathematics': 4,
    'Physics': 3,
    'Chemistry': 3,
    'Biology': 2,
    'History': 2,
    'Geography': 2,
    'Literature in English': 2,
    'Physical Education': 1,
    'Computer Science': 2,
    'Religious Studies': 1,
    'Economics': 2,
  };

  return coefficients[subject] || (stream === 'technical' ? 3 : 2);
}

/**
 * Update subject coefficient (allows editing)
 */
export function updateSubjectCoefficient(subject: string, newCoefficient: number): void {
  // This should be called from a database update function
  // Coefficients are now fully editable and not fixed at 1
  if (newCoefficient < 1 || newCoefficient > 5) {
    throw new Error('Coefficient must be between 1 and 5');
  }
}

/**
 * Check if a class level corresponds to a national exam year
 */
export function isNationalExamYear(
  classLevel: string,
  subsystem: Subsystem
): { isExam: boolean; examType?: string } {
  const examYears: Record<string, string> = {
    // Francophone
    '3ème': 'BEPC',
    'Terminale': 'Baccalauréat',
    'CAP 2': 'CAP',
    'BEP 2': 'BEP',
    'BAC TECH 3': 'Baccalauréat Technique',
    // Anglophone
    'Form 4': 'GCE O/L',
    'Upper Sixth': 'GCE A/L',
  };

  if (examYears[classLevel]) {
    return { isExam: true, examType: examYears[classLevel] };
  }

  return { isExam: false };
}

/**
 * Get promotion threshold (out of 20 for Francophone, percentage for Anglophone)
 */
export function getPromotionThreshold(subsystem: Subsystem): number {
  return subsystem === 'anglophone' ? 50 : 10; // 50% for Anglophone, 10/20 for Francophone
}

/**
 * Format a grade based on subsystem
 */
export function formatGrade(grade: number, subsystem: Subsystem): string {
  if (subsystem === 'anglophone') {
    if (grade >= 90) return 'A';
    if (grade >= 80) return 'B';
    if (grade >= 70) return 'C';
    if (grade >= 60) return 'D';
    if (grade >= 50) return 'E';
    return 'F';
  }
  return grade.toFixed(2);
}

/**
 * Get relationship options for guardians
 */
export const GUARDIAN_RELATIONSHIPS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'elder_sibling', label: 'Elder Sibling' },
  { value: 'legal_guardian', label: 'Legal Guardian' },
  { value: 'other', label: 'Other' },
];

/**
 * Get staff roles
 */
export const STAFF_ROLES = [
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'FORM_MASTER', label: 'Form Master' },
  { value: 'HEAD_OF_DEPARTMENT', label: 'Head of Department' },
  { value: 'BURSAR', label: 'Bursar' },
  { value: 'SECRETARY', label: 'Secretary' },
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'VICE_PRINCIPAL', label: 'Vice Principal' },
  { value: 'LIBRARIAN', label: 'Librarian' },
  { value: 'COUNSELOR', label: 'Counselor' },
  { value: 'OTHER_STAFF', label: 'Other Staff' },
];

/**
 * Get fee types
 */
export const FEE_TYPES = [
  { value: 'registration', label: 'Registration Fee' },
  { value: 'tuition', label: 'Tuition Fee' },
  { value: 'exam', label: 'Exam Fee' },
  { value: 'pta', label: 'PTA Fee' },
  { value: 'library', label: 'Library Fee' },
  { value: 'sports', label: 'Sports Fee' },
  { value: 'transport', label: 'Transport Fee' },
  { value: 'uniform', label: 'Uniform Fee' },
  { value: 'custom', label: 'Custom Fee' },
];

/**
 * Get exam types
 */
export const EXAM_TYPES = [
  { value: 'sequence_1', label: 'Séquence 1 / Quiz 1' },
  { value: 'sequence_2', label: 'Séquence 2 / Quiz 2' },
  { value: 'sequence_3', label: 'Séquence 3 / Quiz 3' },
  { value: 'sequence_4', label: 'Séquence 4 / Quiz 4' },
  { value: 'sequence_5', label: 'Séquence 5 / Quiz 5' },
  { value: 'sequence_6', label: 'Séquence 6 / Quiz 6' },
  { value: 'composition', label: 'Composition Trimestrielle / Mid-Term' },
  { value: 'national', label: 'National Exam' },
  { value: 'other', label: 'Other' },
];

/**
 * Get term names based on subsystem
 */
export function getTermNames(subsystem: Subsystem): Array<{ value: string; label: string }> {
  if (subsystem === 'anglophone') {
    return [
      { value: 'first', label: 'First Term' },
      { value: 'second', label: 'Second Term' },
      { value: 'third', label: 'Third Term' },
    ];
  }
  return [
    { value: 'first', label: 'Premier Trimestre' },
    { value: 'second', label: 'Deuxième Trimestre' },
    { value: 'third', label: 'Troisième Trimestre' },
  ];
}

/**
 * School Node Types for Cameroon Education System
 */
export type SchoolNode = 'GENERAL' | 'TECHNICAL';

export const SCHOOL_NODES: Record<SchoolNode, { label: string; description: string }> = {
  GENERAL: {
    label: 'General Education',
    description: 'General secondary school track leading to GCE/Baccalauréat',
  },
  TECHNICAL: {
    label: 'Technical Education',
    description: 'Technical and vocational secondary school track',
  },
};

/**
 * Get school node for a class level
 */
export function getSchoolNodeForClass(classLevel: string): SchoolNode {
  const technicalClasses = [
    ...FRANCOPHONE_TECHNICAL_CLASSES.map(c => c.value),
    ...ANGLOPHONE_TECHNICAL_CLASSES.map(c => c.value),
  ];
  return technicalClasses.includes(classLevel) ? 'TECHNICAL' : 'GENERAL';
}

/**
 * Section Type for Cameroon Education System
 */
export type Section = 'ANGLOPHONE' | 'FRANCOPHONE';

export const SECTIONS: Record<Section, { label: string; language: string }> = {
  ANGLOPHONE: {
    label: 'Anglophone System',
    language: 'English',
  },
  FRANCOPHONE: {
    label: 'Francophone System',
    language: 'French',
  },
};

/**
 * Get section for a class level
 */
export function getSectionForClass(classLevel: string): Section {
  const anglophoneClasses = ANGLOPHONE_GENERAL_CLASSES.map(c => c.value).concat(
    ANGLOPHONE_TECHNICAL_CLASSES.map(c => c.value)
  );
  return anglophoneClasses.includes(classLevel) ? 'ANGLOPHONE' : 'FRANCOPHONE';
}
