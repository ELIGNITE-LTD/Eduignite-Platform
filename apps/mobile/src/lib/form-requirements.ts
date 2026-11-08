import type { EducationCategory } from '@/lib/cameroon-education-system';

/**
 * One place that says which form fields a school must fill in, may fill in,
 * or never sees, depending on its education level.
 *
 * Secondary and higher schools keep exactly the fields they always had; only
 * the 'basic' (nursery / primary) column is simplified. The backend mirrors
 * the rules that matter (see UserCreateSerializer and the staff create view),
 * so a hidden field can never block a basic school.
 */
export type FieldRule = 'required' | 'optional' | 'hidden';
type Rules = Record<string, FieldRule>;
type FormRules = { basic: Rules; other: Rules };

export const FORM_REQUIREMENTS = {
  staff: {
    basic: {
      name: 'required', position: 'required', phone: 'required', email: 'optional',
      class_teacher_for: 'optional', gender: 'optional', hire_date: 'optional',
      whatsapp: 'hidden', employment_type: 'hidden', sub_school: 'hidden',
      teaching_assignments: 'hidden', class_master_for: 'hidden', password: 'hidden',
    },
    other: {
      name: 'required', role: 'required', email: 'required', phone: 'optional',
      whatsapp: 'optional', employment_type: 'optional', sub_school: 'optional',
      teaching_assignments: 'optional', class_master_for: 'optional', password: 'optional',
      class_teacher_for: 'hidden', gender: 'hidden', hire_date: 'hidden', position: 'hidden',
    },
  },
  pupil: {
    basic: {
      name: 'required', class: 'required', gender: 'optional', date_of_birth: 'optional',
      guardian_name: 'optional', guardian_phone: 'optional',
      email: 'hidden', phone: 'hidden', whatsapp: 'hidden', password: 'hidden',
      class_level: 'hidden', section: 'hidden', admission_number: 'optional',
      admission_date: 'hidden',
    },
    other: {
      name: 'required', class: 'required', gender: 'optional', date_of_birth: 'optional',
      guardian_name: 'optional', guardian_phone: 'optional',
      email: 'optional', phone: 'optional', whatsapp: 'optional', password: 'optional',
      class_level: 'optional', section: 'optional', admission_number: 'optional',
      admission_date: 'optional',
    },
  },
  bulkPupils: {
    basic: {
      sub_school: 'optional', class: 'required', count: 'required', batch_name: 'optional',
      class_level: 'hidden', section: 'hidden', department: 'hidden', stream: 'hidden',
    },
    other: {
      sub_school: 'optional', class: 'required', count: 'required', batch_name: 'optional',
      class_level: 'optional', section: 'optional', department: 'optional', stream: 'optional',
    },
  },
  feeType: {
    basic: { name: 'required', amount: 'required', sub_school: 'hidden', class: 'optional' },
    other: { name: 'required', amount: 'required', sub_school: 'optional', class: 'optional' },
  },
  timetableSlot: {
    basic: { class: 'required', day: 'required', time: 'required', subject: 'optional', teacher: 'optional', room: 'optional' },
    other: { class: 'required', day: 'required', time: 'required', subject: 'required', teacher: 'required', room: 'optional' },
  },
  schoolSettings: {
    basic: { exam_bodies: 'hidden', streams: 'hidden', departments: 'hidden', sequences: 'hidden', transcripts: 'hidden' },
    other: { exam_bodies: 'optional', streams: 'optional', departments: 'optional', sequences: 'optional', transcripts: 'optional' },
  },
} satisfies Record<string, FormRules>;

export type FormKey = keyof typeof FORM_REQUIREMENTS;

export function getFormRules(form: FormKey, category: EducationCategory): Rules {
  const rules = FORM_REQUIREMENTS[form] as FormRules;
  return category === 'basic' ? rules.basic : rules.other;
}

export function fieldRule(form: FormKey, field: string, category: EducationCategory): FieldRule {
  return getFormRules(form, category)[field] ?? 'optional';
}

export const isHidden = (form: FormKey, field: string, category: EducationCategory) =>
  fieldRule(form, field, category) === 'hidden';
export const isRequired = (form: FormKey, field: string, category: EducationCategory) =>
  fieldRule(form, field, category) === 'required';

/**
 * Staff positions offered in a nursery / primary school, mapped onto the
 * roles the backend already has. Secretary and Support staff have no role of
 * their own, so they use the least-privileged staff role (LIBRARIAN) and keep
 * their real title in `job_title`.
 */
export interface BasicStaffPosition {
  key: string;
  label: string;
  labelFr: string;
  role: 'SUB_ADMIN' | 'TEACHER' | 'BURSAR' | 'LIBRARIAN';
  teachesClass: boolean;
}

export const BASIC_STAFF_POSITIONS: BasicStaffPosition[] = [
  { key: 'head_teacher', label: 'Head teacher', labelFr: 'Directeur / Directrice', role: 'SUB_ADMIN', teachesClass: false },
  { key: 'class_teacher', label: 'Class teacher', labelFr: 'Maitre / Maitresse de classe', role: 'TEACHER', teachesClass: true },
  { key: 'assistant_teacher', label: 'Assistant teacher', labelFr: 'Maitre assistant', role: 'TEACHER', teachesClass: true },
  { key: 'bursar', label: 'Bursar', labelFr: 'Econome', role: 'BURSAR', teachesClass: false },
  { key: 'secretary', label: 'Secretary', labelFr: 'Secretaire', role: 'LIBRARIAN', teachesClass: false },
  { key: 'librarian', label: 'Librarian', labelFr: 'Bibliothecaire', role: 'LIBRARIAN', teachesClass: false },
  { key: 'support_staff', label: 'Support staff', labelFr: 'Personnel d\'appui', role: 'LIBRARIAN', teachesClass: false },
];
