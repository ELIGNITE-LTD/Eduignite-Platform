/**
 * EduIgnite Design System
 * Unified design tokens and component guidelines for Cameroon Secondary Schools
 * Aligned with MINESEC standards and 2026 best practices
 */

// ============================================================================
// COLOR PALETTE - Professional & Institutional
// ============================================================================
export const COLORS = {
  // Primary - Cameroon National Colors
  primary: {
    50: "#f0f7ff",
    100: "#e0eeff",
    200: "#c1ddff",
    300: "#a2ccff",
    400: "#83bbff",
    500: "#0066cc", // Primary Blue (MINESEC Standard)
    600: "#0052a3",
    700: "#003d7a",
    800: "#002952",
    900: "#001429",
  },
  
  // Secondary - Cameroon Flag Green
  secondary: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e", // Green (MINESEC Standard)
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#145231",
  },

  // Accent - Cameroon Flag Red
  accent: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ce1126", // Red (MINESEC Standard)
    600: "#b91c1c",
    700: "#991b1b",
    800: "#7f1d1d",
    900: "#651a1a",
  },

  // Neutral - Professional Grays
  neutral: {
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
  },

  // Semantic Colors
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
};

// ============================================================================
// TYPOGRAPHY - Professional & Accessible
// ============================================================================
export const TYPOGRAPHY = {
  fontFamily: {
    headline: "'Inter', 'Segoe UI', sans-serif",
    body: "'Inter', 'Segoe UI', sans-serif",
    mono: "'Fira Code', 'Monaco', monospace",
  },
  
  fontSize: {
    xs: "0.75rem",      // 12px
    sm: "0.875rem",     // 14px
    base: "1rem",       // 16px
    lg: "1.125rem",     // 18px
    xl: "1.25rem",      // 20px
    "2xl": "1.5rem",    // 24px
    "3xl": "1.875rem",  // 30px
    "4xl": "2.25rem",   // 36px
    "5xl": "3rem",      // 48px
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  letterSpacing: {
    tight: "-0.02em",
    normal: "0em",
    wide: "0.02em",
    wider: "0.05em",
    widest: "0.1em",
  },
};

// ============================================================================
// SPACING - Consistent & Scalable
// ============================================================================
export const SPACING = {
  0: "0",
  1: "0.25rem",    // 4px
  2: "0.5rem",     // 8px
  3: "0.75rem",    // 12px
  4: "1rem",       // 16px
  5: "1.25rem",    // 20px
  6: "1.5rem",     // 24px
  8: "2rem",       // 32px
  10: "2.5rem",    // 40px
  12: "3rem",      // 48px
  16: "4rem",      // 64px
  20: "5rem",      // 80px
  24: "6rem",      // 96px
};

// ============================================================================
// BORDER RADIUS - Modern & Accessible
// ============================================================================
export const BORDER_RADIUS = {
  none: "0",
  sm: "0.375rem",      // 6px
  base: "0.5rem",      // 8px
  md: "0.75rem",       // 12px
  lg: "1rem",          // 16px
  xl: "1.5rem",        // 24px
  "2xl": "2rem",       // 32px
  full: "9999px",
};

// ============================================================================
// SHADOWS - Depth & Hierarchy
// ============================================================================
export const SHADOWS = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  base: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
};

// ============================================================================
// TRANSITIONS - Smooth & Responsive
// ============================================================================
export const TRANSITIONS = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  base: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
  slower: "500ms cubic-bezier(0.4, 0, 0.2, 1)",
};

// ============================================================================
// BREAKPOINTS - Mobile-First Responsive Design
// ============================================================================
export const BREAKPOINTS = {
  xs: "320px",
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
};

// ============================================================================
// COMPONENT SIZES - Consistent & Scalable
// ============================================================================
export const COMPONENT_SIZES = {
  button: {
    xs: { padding: "0.25rem 0.75rem", fontSize: "0.75rem", height: "1.75rem" },
    sm: { padding: "0.375rem 0.875rem", fontSize: "0.875rem", height: "2rem" },
    md: { padding: "0.5rem 1rem", fontSize: "1rem", height: "2.5rem" },
    lg: { padding: "0.75rem 1.5rem", fontSize: "1.125rem", height: "3rem" },
    xl: { padding: "1rem 2rem", fontSize: "1.25rem", height: "3.5rem" },
  },
  
  input: {
    sm: { padding: "0.375rem 0.75rem", fontSize: "0.875rem", height: "2rem" },
    md: { padding: "0.5rem 1rem", fontSize: "1rem", height: "2.5rem" },
    lg: { padding: "0.75rem 1.25rem", fontSize: "1.125rem", height: "3rem" },
  },

  avatar: {
    xs: "1.5rem",
    sm: "2rem",
    md: "2.5rem",
    lg: "3rem",
    xl: "4rem",
  },

  icon: {
    xs: "1rem",
    sm: "1.25rem",
    md: "1.5rem",
    lg: "2rem",
    xl: "2.5rem",
  },
};

// ============================================================================
// ACCESSIBILITY STANDARDS - WCAG 2.1 AA Compliance
// ============================================================================
export const ACCESSIBILITY = {
  focusRing: "0 0 0 3px rgba(0, 102, 204, 0.5)",
  minTouchTarget: "44px",
  minContrastRatio: 4.5, // AA standard
  reduceMotion: "@media (prefers-reduced-motion: reduce)",
};

// ============================================================================
// Z-INDEX SCALE - Consistent Stacking Context
// ============================================================================
export const Z_INDEX = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  backdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
};

// ============================================================================
// CAMEROON EDUCATION SYSTEM CONSTANTS
// ============================================================================
export const CAMEROON_EDUCATION = {
  // MINESEC Official Colors
  minesecBlue: "#0066cc",
  minesecGreen: "#22c55e",
  minesecRed: "#ce1126",
  
  // Cameroon Flag
  flagGreen: "#007a5e",
  flagRed: "#ce1126",
  flagYellow: "#fcd116",

  // Academic Levels (Francophone & Anglophone)
  academicLevels: [
    "6ème / Form 1",
    "5ème / Form 2",
    "4ème / Form 3",
    "3ème / Form 4",
    "2nde / Form 5",
    "1ère / Lower Sixth",
    "Terminale / Upper Sixth",
  ],

  // Sections
  sections: [
    "Anglophone Section",
    "Francophone Section",
    "Technical Section",
  ],

  // Grading Scale (0-20)
  gradingScale: {
    A: { min: 18, max: 20, label: "Excellent" },
    B: { min: 16, max: 17.99, label: "Very Good" },
    C: { min: 14, max: 15.99, label: "Good" },
    D: { min: 12, max: 13.99, label: "Satisfactory" },
    E: { min: 10, max: 11.99, label: "Pass" },
    F: { min: 0, max: 9.99, label: "Fail" },
  },

  // Official Motto
  motto: "Paix - Travail - Patrie / Peace - Work - Fatherland",
};

// ============================================================================
// EXPORT DESIGN SYSTEM
// ============================================================================
export const DESIGN_SYSTEM = {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TRANSITIONS,
  BREAKPOINTS,
  COMPONENT_SIZES,
  ACCESSIBILITY,
  Z_INDEX,
  CAMEROON_EDUCATION,
};

export default DESIGN_SYSTEM;
