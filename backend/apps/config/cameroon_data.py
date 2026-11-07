"""
Static Cameroonian secondary school education system data.
Used to power dynamic dropdowns across all forms.
"""

# ── Regions and their Divisions ──────────────────────────────────────────────

CAMEROON_REGIONS = [
    {
        "name": "Adamaoua",
        "divisions": [
            "Djerem", "Faro-et-Deo", "Mayo-Banyo", "Mbere", "Vina"
        ]
    },
    {
        "name": "Centre",
        "divisions": [
            "Haute-Sanaga", "Lekie", "Mbam-et-Inoubou", "Mbam-et-Kim",
            "Mefou-et-Afamba", "Mefou-et-Akono", "Mfoundi", "Ngoumou", "Nyong-et-Kelle",
            "Nyong-et-Mfoumou", "Nyong-et-So'o"
        ]
    },
    {
        "name": "Est",
        "divisions": [
            "Boumba-et-Ngoko", "Haut-Nyong", "Kadey", "Lom-et-Djerem"
        ]
    },
    {
        "name": "Extrême-Nord",
        "divisions": [
            "Diamare", "Logone-et-Chari", "Mayo-Danay", "Mayo-Kani",
            "Mayo-Sava", "Mayo-Tsanaga"
        ]
    },
    {
        "name": "Littoral",
        "divisions": [
            "Moungo", "Nkam", "Sanaga-Maritime", "Wouri"
        ]
    },
    {
        "name": "Nord",
        "divisions": [
            "Benoue", "Faro", "Mayo-Louti", "Mayo-Rey"
        ]
    },
    {
        "name": "Nord-Ouest",
        "divisions": [
            "Boyo", "Bui", "Donga-Mantung", "Menchum", "Mezam",
            "Momo", "Ngo-Ketunjia"
        ]
    },
    {
        "name": "Ouest",
        "divisions": [
            "Bamboutos", "Haut-Nkam", "Hauts-Plateaux", "Koung-Khi",
            "Menoua", "Mifi", "Nde", "Noun"
        ]
    },
    {
        "name": "Sud",
        "divisions": [
            "Dja-et-Lobo", "Mvila", "Ocean", "Vallee-du-Ntem"
        ]
    },
    {
        "name": "Sud-Ouest",
        "divisions": [
            "Fako", "Kupe-Manenguba", "Lebialem", "Manyu",
            "Meme", "Ndian"
        ]
    },
]

# ── School Types ──────────────────────────────────────────────────────────────

SCHOOL_TYPES = [
    {"value": "general", "label": "General Education (Enseignement Général)"},
    {"value": "technical", "label": "Technical & Vocational (Enseignement Technique)"},
    {"value": "mixed", "label": "Mixed (General + Technical)"},
]

# ── Education Categories ──────────────────────────────────────────────────────

EDUCATION_CATEGORIES = [
    {"value": "basic", "label": "Basic Education"},
    {"value": "secondary", "label": "Secondary Education"},
    {"value": "higher", "label": "Higher Education"},
]

# ── Subsystems ────────────────────────────────────────────────────────────────

SUBSYSTEMS = [
    {"value": "francophone", "label": "Francophone"},
    {"value": "anglophone", "label": "Anglophone"},
    {"value": "bilingual", "label": "Bilingual (Both)"},
]

# ── Class Levels by Subsystem and School Type ─────────────────────────────────

CLASS_LEVELS = {
    "francophone_general": [
        {"value": "6eme", "label": "Sixième (6ème)", "exam_year": False, "national_exam": None},
        {"value": "5eme", "label": "Cinquième (5ème)", "exam_year": False, "national_exam": None},
        {"value": "4eme", "label": "Quatrième (4ème)", "exam_year": False, "national_exam": None},
        {"value": "3eme", "label": "Troisième (3ème)", "exam_year": True, "national_exam": "BEPC"},
        {"value": "seconde", "label": "Seconde", "exam_year": False, "national_exam": None},
        {"value": "premiere", "label": "Première", "exam_year": False, "national_exam": None},
        {"value": "terminale", "label": "Terminale", "exam_year": True, "national_exam": "Baccalauréat"},
    ],
    "anglophone_general": [
        {"value": "form1", "label": "Form 1", "exam_year": False, "national_exam": None},
        {"value": "form2", "label": "Form 2", "exam_year": False, "national_exam": None},
        {"value": "form3", "label": "Form 3", "exam_year": False, "national_exam": None},
        {"value": "form4", "label": "Form 4", "exam_year": False, "national_exam": None},
        {"value": "form5", "label": "Form 5", "exam_year": True, "national_exam": "GCE O/L"},
        {"value": "lower_sixth", "label": "Lower Sixth", "exam_year": False, "national_exam": None},
        {"value": "upper_sixth", "label": "Upper Sixth", "exam_year": True, "national_exam": "GCE A/L"},
    ],
    "francophone_technical": [
        {"value": "cap1", "label": "CAP 1", "exam_year": False, "national_exam": None},
        {"value": "cap2", "label": "CAP 2", "exam_year": True, "national_exam": "CAP"},
        {"value": "bep1", "label": "BEP 1", "exam_year": False, "national_exam": None},
        {"value": "bep2", "label": "BEP 2", "exam_year": True, "national_exam": "BEP"},
        {"value": "bac_tech1", "label": "BAC TECH 1", "exam_year": False, "national_exam": None},
        {"value": "bac_tech2", "label": "BAC TECH 2", "exam_year": False, "national_exam": None},
        {"value": "bac_tech3", "label": "BAC TECH 3", "exam_year": True, "national_exam": "Baccalauréat Technique"},
    ],
    "anglophone_technical": [
        {"value": "tech_year1", "label": "Technical Year 1", "exam_year": False, "national_exam": None},
        {"value": "tech_year2", "label": "Technical Year 2", "exam_year": False, "national_exam": None},
        {"value": "tech_year3", "label": "Technical Year 3", "exam_year": True, "national_exam": "City & Guilds"},
        {"value": "tech_year4", "label": "Technical Year 4", "exam_year": False, "national_exam": None},
        {"value": "tech_year5", "label": "Technical Year 5", "exam_year": True, "national_exam": "City & Guilds Advanced"},
    ],
    # Basic Education (additive keys; the secondary keys above are unchanged).
    "anglophone_nursery": [
        {"value": "nursery1", "label": "Nursery 1", "exam_year": False, "national_exam": None, "cycle": "nursery"},
        {"value": "nursery2", "label": "Nursery 2", "exam_year": False, "national_exam": None, "cycle": "nursery"},
        {"value": "nursery3", "label": "Nursery 3", "exam_year": False, "national_exam": None, "cycle": "nursery"},
    ],
    "francophone_nursery": [
        {"value": "ps", "label": "Petite Section (PS)", "exam_year": False, "national_exam": None, "cycle": "nursery"},
        {"value": "ms", "label": "Moyenne Section (MS)", "exam_year": False, "national_exam": None, "cycle": "nursery"},
        {"value": "gs", "label": "Grande Section (GS)", "exam_year": False, "national_exam": None, "cycle": "nursery"},
    ],
    "anglophone_primary": [
        {"value": "class1", "label": "Class 1", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "class2", "label": "Class 2", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "class3", "label": "Class 3", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "class4", "label": "Class 4", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "class5", "label": "Class 5", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "class6", "label": "Class 6", "exam_year": True, "national_exam": "FSLC", "cycle": "primary"},
    ],
    "francophone_primary": [
        {"value": "sil", "label": "SIL (Section d'Initiation au Langage)", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "cp", "label": "CP (Cours Préparatoire)", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "ce1", "label": "CE1 (Cours Élémentaire 1)", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "ce2", "label": "CE2 (Cours Élémentaire 2)", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "cm1", "label": "CM1 (Cours Moyen 1)", "exam_year": False, "national_exam": None, "cycle": "primary"},
        {"value": "cm2", "label": "CM2 (Cours Moyen 2)", "exam_year": True, "national_exam": "CEP", "cycle": "primary"},
    ],
}

# ── Specialisations for Technical Schools ────────────────────────────────────

TECHNICAL_SPECIALISATIONS = [
    {"value": "informatique", "label": "Informatique (Computer Science)"},
    {"value": "electronique", "label": "Électronique (Electronics)"},
    {"value": "mecanique_auto", "label": "Mécanique Automobile (Auto Mechanics)"},
    {"value": "genie_civil", "label": "Génie Civil (Civil Engineering)"},
    {"value": "secretariat", "label": "Secrétariat-Bureautique (Secretarial)"},
    {"value": "comptabilite", "label": "Comptabilité (Accounting)"},
    {"value": "hotellerie", "label": "Hôtellerie-Restauration (Hospitality)"},
    {"value": "agriculture", "label": "Agriculture"},
    {"value": "couture", "label": "Couture-Mode (Fashion & Sewing)"},
    {"value": "electricite", "label": "Électricité (Electrical)"},
    {"value": "menuiserie", "label": "Menuiserie (Carpentry)"},
    {"value": "plomberie", "label": "Plomberie (Plumbing)"},
    {"value": "soudure", "label": "Soudure (Welding)"},
    {"value": "commerce", "label": "Commerce (Business)"},
    {"value": "gestion", "label": "Gestion (Management)"},
]

# ── Subjects by Subsystem ────────────────────────────────────────────────────

SUBJECTS = {
    "francophone_general": [
        {"name": "Français", "code": "FR", "coefficient": 4},
        {"name": "Mathématiques", "code": "MATH", "coefficient": 4},
        {"name": "Sciences Physiques et Chimie", "code": "SPC", "coefficient": 3},
        {"name": "Sciences de la Vie et de la Terre", "code": "SVT", "coefficient": 3},
        {"name": "Histoire-Géographie", "code": "HG", "coefficient": 3},
        {"name": "Anglais", "code": "ANG", "coefficient": 3},
        {"name": "Éducation Physique et Sportive", "code": "EPS", "coefficient": 2},
        {"name": "Philosophie", "code": "PHILO", "coefficient": 3},
        {"name": "Économie", "code": "ECO", "coefficient": 2},
        {"name": "Informatique", "code": "INFO", "coefficient": 2},
        {"name": "Arts Plastiques", "code": "ARTS", "coefficient": 1},
        {"name": "Éducation Civique", "code": "EC", "coefficient": 2},
        {"name": "Latin", "code": "LAT", "coefficient": 2},
        {"name": "Espagnol", "code": "ESP", "coefficient": 2},
        {"name": "Allemand", "code": "ALL", "coefficient": 2},
    ],
    "anglophone_general": [
        {"name": "English Language", "code": "ENG", "coefficient": 4},
        {"name": "Mathematics", "code": "MATH", "coefficient": 4},
        {"name": "Physics", "code": "PHY", "coefficient": 3},
        {"name": "Chemistry", "code": "CHEM", "coefficient": 3},
        {"name": "Biology", "code": "BIO", "coefficient": 3},
        {"name": "History", "code": "HIST", "coefficient": 3},
        {"name": "Geography", "code": "GEO", "coefficient": 3},
        {"name": "Literature in English", "code": "LIT", "coefficient": 3},
        {"name": "French Language", "code": "FR", "coefficient": 3},
        {"name": "Physical Education", "code": "PE", "coefficient": 2},
        {"name": "Computer Science", "code": "CS", "coefficient": 2},
        {"name": "Religious Studies", "code": "RS", "coefficient": 2},
        {"name": "Economics", "code": "ECO", "coefficient": 3},
        {"name": "Commerce", "code": "COM", "coefficient": 3},
        {"name": "Food and Nutrition", "code": "FN", "coefficient": 2},
        {"name": "Further Mathematics", "code": "FM", "coefficient": 4},
    ],
    "francophone_technical_informatique": [
        {"name": "Algorithmique et Programmation", "code": "ALGO", "coefficient": 5},
        {"name": "Réseaux Informatiques", "code": "RES", "coefficient": 4},
        {"name": "Base de Données", "code": "BDD", "coefficient": 4},
        {"name": "Maintenance Informatique", "code": "MAINT", "coefficient": 4},
        {"name": "Systèmes d'Exploitation", "code": "SE", "coefficient": 3},
        {"name": "Développement Web", "code": "WEB", "coefficient": 4},
        {"name": "Mathématiques", "code": "MATH", "coefficient": 3},
        {"name": "Français", "code": "FR", "coefficient": 2},
        {"name": "Anglais Technique", "code": "ANGT", "coefficient": 2},
        {"name": "Éducation Physique et Sportive", "code": "EPS", "coefficient": 1},
    ],
    "francophone_technical_comptabilite": [
        {"name": "Comptabilité Générale", "code": "COMPT", "coefficient": 5},
        {"name": "Comptabilité Analytique", "code": "CA", "coefficient": 4},
        {"name": "Fiscalité", "code": "FISC", "coefficient": 4},
        {"name": "Droit Commercial", "code": "DC", "coefficient": 3},
        {"name": "Économie d'Entreprise", "code": "EE", "coefficient": 3},
        {"name": "Informatique de Gestion", "code": "IG", "coefficient": 3},
        {"name": "Mathématiques", "code": "MATH", "coefficient": 3},
        {"name": "Français", "code": "FR", "coefficient": 2},
        {"name": "Anglais des Affaires", "code": "AA", "coefficient": 2},
        {"name": "Éducation Physique et Sportive", "code": "EPS", "coefficient": 1},
    ],
    "francophone_technical_mecanique": [
        {"name": "Technologie Automobile", "code": "TECH", "coefficient": 5},
        {"name": "Mécanique Générale", "code": "MECA", "coefficient": 5},
        {"name": "Électricité Automobile", "code": "ELEC", "coefficient": 4},
        {"name": "Dessin Technique", "code": "DT", "coefficient": 3},
        {"name": "Mathématiques Appliquées", "code": "MATH", "coefficient": 3},
        {"name": "Physique Appliquée", "code": "PHY", "coefficient": 3},
        {"name": "Français", "code": "FR", "coefficient": 2},
        {"name": "Anglais Technique", "code": "ANGT", "coefficient": 2},
        {"name": "Éducation Physique et Sportive", "code": "EPS", "coefficient": 1},
    ],
    "francophone_technical_genie_civil": [
        {"name": "Topographie", "code": "TOPO", "coefficient": 5},
        {"name": "Béton Armé", "code": "BA", "coefficient": 5},
        {"name": "Dessin de Bâtiment", "code": "DB", "coefficient": 4},
        {"name": "Résistance des Matériaux", "code": "RDM", "coefficient": 4},
        {"name": "Technologie de Construction", "code": "TC", "coefficient": 4},
        {"name": "Mathématiques", "code": "MATH", "coefficient": 3},
        {"name": "Physique", "code": "PHY", "coefficient": 3},
        {"name": "Français", "code": "FR", "coefficient": 2},
        {"name": "Éducation Physique et Sportive", "code": "EPS", "coefficient": 1},
    ],
}

# ── Exam Types ────────────────────────────────────────────────────────────────

EXAM_TYPES = [
    {"value": "sequence1", "label": "Séquence 1 / Sequence 1"},
    {"value": "sequence2", "label": "Séquence 2 / Sequence 2"},
    {"value": "composition1", "label": "Composition 1ère Trimestre / First Term Exam"},
    {"value": "sequence3", "label": "Séquence 3 / Sequence 3"},
    {"value": "sequence4", "label": "Séquence 4 / Sequence 4"},
    {"value": "composition2", "label": "Composition 2ème Trimestre / Second Term Exam"},
    {"value": "sequence5", "label": "Séquence 5 / Sequence 5"},
    {"value": "sequence6", "label": "Séquence 6 / Sequence 6"},
    {"value": "composition3", "label": "Composition 3ème Trimestre / Third Term Exam"},
    {"value": "national_exam", "label": "National Exam (BEPC / BAC / GCE)"},
    {"value": "mock_exam", "label": "Mock / Pre-national Exam"},
    {"value": "other", "label": "Other"},
]

# ── Terms ─────────────────────────────────────────────────────────────────────

TERMS = [
    {"value": "first", "label_fr": "Premier Trimestre", "label_en": "First Term"},
    {"value": "second", "label_fr": "Deuxième Trimestre", "label_en": "Second Term"},
    {"value": "third", "label_fr": "Troisième Trimestre", "label_en": "Third Term"},
]

# ── Fee Types ─────────────────────────────────────────────────────────────────

FEE_TYPES = [
    {"value": "registration", "label": "Registration Fee (Frais d'inscription)"},
    {"value": "tuition", "label": "Tuition Fee (Frais de scolarité)"},
    {"value": "exam", "label": "Exam Fee (Frais d'examen)"},
    {"value": "pta", "label": "PTA Fee (Cotisation APE/PTA)"},
    {"value": "library", "label": "Library Fee (Frais de bibliothèque)"},
    {"value": "sports", "label": "Sports Fee (Frais de sport)"},
    {"value": "computer", "label": "Computer Lab Fee (Frais de salle informatique)"},
    {"value": "uniform", "label": "Uniform Fee (Frais de tenue)"},
    {"value": "transport", "label": "Transport Fee (Frais de transport)"},
    {"value": "boarding", "label": "Boarding Fee (Frais d'internat)"},
    {"value": "custom", "label": "Other / Custom"},
]

# ── Staff Roles ───────────────────────────────────────────────────────────────

STAFF_ROLES = [
    {"value": "TEACHER", "label": "Teacher (Professeur)"},
    {"value": "SUB_ADMIN", "label": "Sub Administrator (Sous-Directeur)"},
    {"value": "BURSAR", "label": "Bursar (Économe)"},
    {"value": "LIBRARIAN", "label": "Librarian (Bibliothécaire)"},
]

# ── Gender Options ────────────────────────────────────────────────────────────

GENDER_OPTIONS = [
    {"value": "male", "label": "Male / Masculin"},
    {"value": "female", "label": "Female / Féminin"},
]

# ── Guardian Relationship Options ─────────────────────────────────────────────

GUARDIAN_RELATIONSHIPS = [
    {"value": "father", "label": "Father / Père"},
    {"value": "mother", "label": "Mother / Mère"},
    {"value": "guardian", "label": "Guardian / Tuteur"},
    {"value": "uncle", "label": "Uncle / Oncle"},
    {"value": "aunt", "label": "Aunt / Tante"},
    {"value": "elder_sibling", "label": "Elder Sibling / Grand frère ou sœur"},
    {"value": "legal_guardian", "label": "Legal Guardian / Tuteur légal"},
    {"value": "other", "label": "Other / Autre"},
]

# ── Subscription Plans ────────────────────────────────────────────────────────

SUBSCRIPTION_PLANS = [
    {"value": "starter", "label": "Starter — up to 200 students"},
    {"value": "standard", "label": "Standard — up to 500 students"},
    {"value": "premium", "label": "Premium — up to 1500 students"},
    {"value": "enterprise", "label": "Enterprise — unlimited students"},
]
