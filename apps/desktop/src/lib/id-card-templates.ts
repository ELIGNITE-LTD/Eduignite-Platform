/**
 * ID Card Template Management System
 * Supports customizable templates for Cameroon Secondary Schools (MINESEC Standard)
 */

export interface IDCardField {
  id: string;
  label: string;
  type: "text" | "image" | "qrcode" | "barcode" | "date" | "signature";
  x: number; // Position X (percentage)
  y: number; // Position Y (percentage)
  width: number; // Width (percentage)
  height: number; // Height (percentage)
  fontSize?: number;
  fontWeight?: "normal" | "bold" | "semibold";
  color?: string;
  alignment?: "left" | "center" | "right";
  required?: boolean;
}

export interface IDCardTemplate {
  id: string;
  name: string;
  description: string;
  schoolId: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Card dimensions (in mm)
  cardWidth: number; // Standard: 85.6mm
  cardHeight: number; // Standard: 53.98mm
  
  // Front side configuration
  frontSide: {
    backgroundColor: string;
    backgroundImage?: string;
    fields: IDCardField[];
  };
  
  // Back side configuration
  backSide: {
    backgroundColor: string;
    backgroundImage?: string;
    fields: IDCardField[];
  };
  
  // Security features
  security: {
    includeQRCode: boolean;
    includeBarcode: boolean;
    includeHologram: boolean;
    watermarkText?: string;
    digitallySigned: boolean;
  };
}

export interface IDCardGenerationAudit {
  id: string;
  templateId: string;
  schoolId: string;
  generatedBy: string; // User ID
  generatedAt: Date;
  studentCount: number;
  studentIds: string[];
  status: "pending" | "completed" | "failed";
  errorMessage?: string;
}

// ============================================================================
// DEFAULT TEMPLATES FOR CAMEROON SCHOOLS
// ============================================================================

export const CAMEROON_STANDARD_TEMPLATE: IDCardTemplate = {
  id: "cameroon-standard-v1",
  name: "Cameroon MINESEC Standard",
  description: "Official ID card template compliant with MINESEC standards",
  schoolId: "default",
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  
  cardWidth: 85.6,
  cardHeight: 53.98,
  
  frontSide: {
    backgroundColor: "#ffffff",
    fields: [
      // National Header
      {
        id: "national-header",
        label: "National Header",
        type: "text",
        x: 0,
        y: 2,
        width: 100,
        height: 8,
        fontSize: 7,
        fontWeight: "bold",
        color: "#ffffff",
        alignment: "center",
      },
      // School Logo
      {
        id: "school-logo",
        label: "School Logo",
        type: "image",
        x: 5,
        y: 12,
        width: 15,
        height: 20,
      },
      // School Name
      {
        id: "school-name",
        label: "School Name",
        type: "text",
        x: 22,
        y: 12,
        width: 73,
        height: 8,
        fontSize: 9,
        fontWeight: "bold",
        color: "#0066cc",
        alignment: "left",
      },
      // Student Photo
      {
        id: "student-photo",
        label: "Student Photo",
        type: "image",
        x: 5,
        y: 35,
        width: 20,
        height: 28,
      },
      // Student Name
      {
        id: "student-name",
        label: "Student Name",
        type: "text",
        x: 28,
        y: 35,
        width: 67,
        height: 6,
        fontSize: 8,
        fontWeight: "bold",
        color: "#000000",
        alignment: "left",
      },
      // Matricule/Admission Number
      {
        id: "matricule",
        label: "Matricule",
        type: "text",
        x: 28,
        y: 42,
        width: 67,
        height: 5,
        fontSize: 7,
        fontWeight: "semibold",
        color: "#0066cc",
        alignment: "left",
      },
      // Class/Level
      {
        id: "class-level",
        label: "Class Level",
        type: "text",
        x: 28,
        y: 48,
        width: 32,
        height: 5,
        fontSize: 7,
        fontWeight: "normal",
        color: "#333333",
        alignment: "left",
      },
      // Section
      {
        id: "section",
        label: "Section",
        type: "text",
        x: 63,
        y: 48,
        width: 32,
        height: 5,
        fontSize: 7,
        fontWeight: "normal",
        color: "#333333",
        alignment: "left",
      },
      // QR Code
      {
        id: "qr-code",
        label: "QR Code",
        type: "qrcode",
        x: 78,
        y: 35,
        width: 17,
        height: 18,
      },
      // Validity Date
      {
        id: "validity-date",
        label: "Valid Until",
        type: "date",
        x: 5,
        y: 65,
        width: 40,
        height: 4,
        fontSize: 6,
        fontWeight: "normal",
        color: "#666666",
        alignment: "left",
      },
    ],
  },
  
  backSide: {
    backgroundColor: "#f5f5f5",
    fields: [
      // Back Header
      {
        id: "back-header",
        label: "Back Header",
        type: "text",
        x: 0,
        y: 2,
        width: 100,
        height: 6,
        fontSize: 8,
        fontWeight: "bold",
        color: "#0066cc",
        alignment: "center",
      },
      // Emergency Contact
      {
        id: "emergency-contact",
        label: "Emergency Contact",
        type: "text",
        x: 5,
        y: 10,
        width: 90,
        height: 15,
        fontSize: 6,
        fontWeight: "normal",
        color: "#000000",
        alignment: "left",
      },
      // Guardian Information
      {
        id: "guardian-info",
        label: "Guardian Information",
        type: "text",
        x: 5,
        y: 28,
        width: 90,
        height: 15,
        fontSize: 6,
        fontWeight: "normal",
        color: "#000000",
        alignment: "left",
      },
      // School Seal/Signature
      {
        id: "school-seal",
        label: "School Seal",
        type: "image",
        x: 5,
        y: 45,
        width: 20,
        height: 20,
      },
      // Principal Signature
      {
        id: "principal-signature",
        label: "Principal Signature",
        type: "signature",
        x: 75,
        y: 45,
        width: 20,
        height: 15,
      },
      // Barcode
      {
        id: "barcode",
        label: "Barcode",
        type: "barcode",
        x: 5,
        y: 67,
        width: 90,
        height: 6,
      },
    ],
  },
  
  security: {
    includeQRCode: true,
    includeBarcode: true,
    includeHologram: false,
    watermarkText: "MINESEC - OFFICIAL ID",
    digitallySigned: true,
  },
};

export const PROFESSIONAL_MODERN_TEMPLATE: IDCardTemplate = {
  id: "professional-modern-v1",
  name: "Professional Modern Design",
  description: "Contemporary design with gradient backgrounds and modern typography",
  schoolId: "default",
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  
  cardWidth: 85.6,
  cardHeight: 53.98,
  
  frontSide: {
    backgroundColor: "#0066cc",
    fields: [
      // School Logo (Top Left)
      {
        id: "school-logo",
        label: "School Logo",
        type: "image",
        x: 5,
        y: 5,
        width: 18,
        height: 18,
      },
      // School Name (Top Right)
      {
        id: "school-name",
        label: "School Name",
        type: "text",
        x: 25,
        y: 5,
        width: 70,
        height: 8,
        fontSize: 10,
        fontWeight: "bold",
        color: "#ffffff",
        alignment: "left",
      },
      // Student Photo (Center)
      {
        id: "student-photo",
        label: "Student Photo",
        type: "image",
        x: 8,
        y: 25,
        width: 22,
        height: 30,
      },
      // Student Name
      {
        id: "student-name",
        label: "Student Name",
        type: "text",
        x: 32,
        y: 25,
        width: 63,
        height: 7,
        fontSize: 9,
        fontWeight: "bold",
        color: "#ffffff",
        alignment: "left",
      },
      // Matricule
      {
        id: "matricule",
        label: "Matricule",
        type: "text",
        x: 32,
        y: 33,
        width: 63,
        height: 5,
        fontSize: 7,
        fontWeight: "semibold",
        color: "#fcd116",
        alignment: "left",
      },
      // Class & Section
      {
        id: "class-section",
        label: "Class & Section",
        type: "text",
        x: 32,
        y: 39,
        width: 63,
        height: 5,
        fontSize: 7,
        fontWeight: "normal",
        color: "#ffffff",
        alignment: "left",
      },
      // QR Code
      {
        id: "qr-code",
        label: "QR Code",
        type: "qrcode",
        x: 77,
        y: 25,
        width: 18,
        height: 18,
      },
      // Validity
      {
        id: "validity",
        label: "Valid Until",
        type: "date",
        x: 32,
        y: 46,
        width: 63,
        height: 4,
        fontSize: 6,
        fontWeight: "normal",
        color: "#cccccc",
        alignment: "left",
      },
    ],
  },
  
  backSide: {
    backgroundColor: "#f5f5f5",
    fields: [
      // Emergency Contact Section
      {
        id: "emergency-section",
        label: "Emergency Contact",
        type: "text",
        x: 5,
        y: 5,
        width: 90,
        height: 18,
        fontSize: 7,
        fontWeight: "normal",
        color: "#000000",
        alignment: "left",
      },
      // Guardian Section
      {
        id: "guardian-section",
        label: "Guardian Information",
        type: "text",
        x: 5,
        y: 25,
        width: 90,
        height: 18,
        fontSize: 7,
        fontWeight: "normal",
        color: "#000000",
        alignment: "left",
      },
      // School Seal
      {
        id: "school-seal",
        label: "School Seal",
        type: "image",
        x: 10,
        y: 45,
        width: 18,
        height: 18,
      },
      // Signature Line
      {
        id: "signature-line",
        label: "Principal Signature",
        type: "signature",
        x: 70,
        y: 48,
        width: 25,
        height: 12,
      },
    ],
  },
  
  security: {
    includeQRCode: true,
    includeBarcode: true,
    includeHologram: false,
    watermarkText: "OFFICIAL STUDENT ID",
    digitallySigned: true,
  },
};

// ============================================================================
// TEMPLATE MANAGEMENT FUNCTIONS
// ============================================================================

export const DEFAULT_TEMPLATES: IDCardTemplate[] = [
  CAMEROON_STANDARD_TEMPLATE,
  PROFESSIONAL_MODERN_TEMPLATE,
];

export function createCustomTemplate(
  name: string,
  description: string,
  schoolId: string,
  baseTemplate: IDCardTemplate = CAMEROON_STANDARD_TEMPLATE
): IDCardTemplate {
  return {
    ...baseTemplate,
    id: `custom-${Date.now()}`,
    name,
    description,
    schoolId,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function validateTemplate(template: IDCardTemplate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!template.name || template.name.trim().length === 0) {
    errors.push("Template name is required");
  }

  if (template.cardWidth <= 0 || template.cardHeight <= 0) {
    errors.push("Card dimensions must be positive");
  }

  const validateFields = (fields: IDCardField[], side: string) => {
    fields.forEach((field) => {
      if (field.x < 0 || field.x > 100) {
        errors.push(`${side}: Field "${field.label}" X position must be between 0-100`);
      }
      if (field.y < 0 || field.y > 100) {
        errors.push(`${side}: Field "${field.label}" Y position must be between 0-100`);
      }
      if (field.width <= 0 || field.width > 100) {
        errors.push(`${side}: Field "${field.label}" width must be between 0-100`);
      }
      if (field.height <= 0 || field.height > 100) {
        errors.push(`${side}: Field "${field.label}" height must be between 0-100`);
      }
    });
  };

  validateFields(template.frontSide.fields, "Front Side");
  validateFields(template.backSide.fields, "Back Side");

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getFieldValue(field: IDCardField, studentData: any): string {
  switch (field.id) {
    case "student-name":
      return studentData.name || "";
    case "matricule":
      return studentData.matricule || studentData.admission_number || "";
    case "class-level":
      return studentData.class_level || studentData.student_class || "";
    case "section":
      return studentData.section || "";
    case "validity-date":
      return new Date(new Date().getFullYear() + 1, 11, 31).toLocaleDateString();
    case "emergency-contact":
      return `Emergency: ${studentData.guardian_name || ""}\nPhone: ${studentData.guardian_phone || ""}`;
    case "guardian-info":
      return `Guardian: ${studentData.guardian_name || ""}\nPhone: ${studentData.guardian_phone || ""}\nAddress: ${studentData.address || ""}`;
    default:
      return "";
  }
}

export default {
  CAMEROON_STANDARD_TEMPLATE,
  PROFESSIONAL_MODERN_TEMPLATE,
  DEFAULT_TEMPLATES,
  createCustomTemplate,
  validateTemplate,
  getFieldValue,
};
