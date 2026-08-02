
'use client';

import { 
  doc, 
  runTransaction, 
  Firestore, 
  getDoc,
  serverTimestamp
} from 'firebase/firestore';

/**
 * EDUIGNITE INTELLIGENT MATRICULE SYSTEM
 * 
 * Rules:
 * - Platform Level: EduI + YY + ROLE + ID(3)
 * - School Admin: [School Base] + [YY]
 * - School Staff: [School Base] + [YY] + [RoleCode] + ID(3)
 * - Students/Parents: [School Base] + [YY] + [RoleCode] + ID(4)
 */

export type PlatformRole = 'CEO' | 'CTO' | 'COO' | 'INV';
export type SchoolRole = 'ADMIN' | 'SUB_ADMIN' | 'BURSAR' | 'LIBRARIAN' | 'TEACHER' | 'STUDENT' | 'PARENT';

const ROLE_CODES: Record<string, string> = {
  CEO: 'CEO',
  CTO: 'CTO',
  COO: 'COO',
  INV: 'INV',
  ADMIN: '', // No code for primary admin
  SUB_ADMIN: 'A',
  BURSAR: 'B',
  LIBRARIAN: 'L',
  TEACHER: 'T',
  STUDENT: 'S',
  PARENT: 'P'
};

/**
 * Generates a two-digit year code (YY)
 */
function getYearCode(): string {
  return new Date().getFullYear().toString().slice(-2);
}

/**
 * Formats a number with leading zeros
 */
function formatSequence(num: number, length: number): string {
  return num.toString().padStart(length, '0');
}

/**
 * Generates a Platform-Level Matricule
 */
export async function generatePlatformMatricule(
  db: Firestore, 
  role: PlatformRole
): Promise<string> {
  const year = getYearCode();
  const roleCode = ROLE_CODES[role];
  const counterId = `platform_${year}_${roleCode}`;
  const counterRef = doc(db, 'counters', counterId);

  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const nextCount = (counterDoc.exists() ? counterDoc.data().count : 0) + 1;
    
    transaction.set(counterRef, { count: nextCount });
    
    const sequence = formatSequence(nextCount, 3);
    return `EduI${year}${roleCode}${sequence}`;
  });
}

/**
 * Generates a School-Level Matricule
 */
export async function generateSchoolMatricule(
  db: Firestore,
  schoolBase: string, // e.g., "GBHS1"
  role: SchoolRole
): Promise<string> {
  const year = getYearCode();
  
  // Special Case: School Admin (Fixed base + Year)
  if (role === 'ADMIN') {
    return `${schoolBase}${year}`;
  }

  const roleCode = ROLE_CODES[role];
  const counterId = `${year}_${roleCode}`;
  const counterRef = doc(db, 'schools', schoolBase, 'counters', counterId);
  
  // Determine sequence length: 4 for Students/Parents, 3 for Staff
  const seqLength = (role === 'STUDENT' || role === 'PARENT') ? 4 : 3;

  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const nextCount = (counterDoc.exists() ? counterDoc.data().count : 0) + 1;
    
    transaction.set(counterRef, { count: nextCount });
    
    const sequence = formatSequence(nextCount, seqLength);
    return `${schoolBase}${year}${roleCode}${sequence}`;
  });
}

/**
 * Registers a matricule to a UID, ensuring global uniqueness
 */
export async function registerMatricule(
  db: Firestore,
  matricule: string,
  uid: string
): Promise<void> {
  const registryRef = doc(db, 'matricules', matricule);
  
  await runTransaction(db, async (transaction) => {
    const registryDoc = await transaction.get(registryRef);
    if (registryDoc.exists()) {
      throw new Error(`Matricule ${matricule} is already registered.`);
    }
    transaction.set(registryRef, { uid, registeredAt: serverTimestamp() });
  });
}
