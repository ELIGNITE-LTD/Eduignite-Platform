'use server';
/**
 * @fileOverview Generates personalised, constructive student feedback using Groq.
 *
 * - generateStudentFeedback - A function that handles the student feedback generation.
 * - GenerateStudentFeedbackInput  - Input type.
 * - GenerateStudentFeedbackOutput - Output type.
 */

import { groqClient, GROQ_MODEL } from '@/ai/genkit';

type Grade = {
  assignment: string;
  score: number;
  maxScore: number;
};

export type GenerateStudentFeedbackInput = {
  studentName: string;
  className: string;
  grades: Grade[];
  attendancePercentage: number;
  additionalContext?: string;
};

export type GenerateStudentFeedbackOutput = {
  feedback: string;
};

const SYSTEM_PROMPT = `You are an AI assistant specialised in generating personalised and constructive feedback for students.

Your feedback must:
1. Start with a positive acknowledgment or an area of strength.
2. Clearly identify areas for improvement, providing specific examples where possible.
3. Offer actionable suggestions or strategies for growth.
4. Maintain a supportive and encouraging tone.
5. Be concise yet comprehensive.

Provide the feedback in a single, well-structured paragraph.`;

function buildGradeLines(grades: Grade[]): string {
  return grades
    .map((g) => `- ${g.assignment}: ${g.score}/${g.maxScore}`)
    .join('\n');
}

function buildUserMessage(input: GenerateStudentFeedbackInput): string {
  const contextPart = input.additionalContext
    ? `\nAdditional Context: ${input.additionalContext}`
    : '';

  return `Generate detailed feedback for the student named '${input.studentName}' in the class '${input.className}'.

Academic Performance (Grades):
${buildGradeLines(input.grades)}

Attendance: ${input.attendancePercentage}% (higher is better).${contextPart}`;
}

export async function generateStudentFeedback(
  input: GenerateStudentFeedbackInput
): Promise<GenerateStudentFeedbackOutput> {
  const completion = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input) },
    ],
    max_tokens: 512,
    temperature: 0.7,
    top_p: 0.95,
  });

  const feedback = (completion as any).choices?.[0]?.message?.content?.trim() ?? '';
  if (!feedback) {
    throw new Error('Failed to generate feedback.');
  }

  return { feedback };
}
