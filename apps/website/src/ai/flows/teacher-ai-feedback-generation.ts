/**
 * Generates personalised, constructive student feedback.
 *
 * Every app sends this through the backend's AI endpoint (`POST /ai/chat/`)
 * rather than calling the AI provider itself: the backend holds the provider
 * credentials, and the request is paid for in AI credits like every other AI
 * feature. The exported types and function signature are the same everywhere.
 */

import { apiClient } from '@/lib/api/client';

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

function buildGradeLines(grades: Grade[]): string {
  return grades.map((g) => `- ${g.assignment}: ${g.score}/${g.maxScore}`).join('\n');
}

function buildPrompt(input: GenerateStudentFeedbackInput): string {
  const contextPart = input.additionalContext
    ? `\nAdditional Context: ${input.additionalContext}`
    : '';
  return `You are an assistant that writes personalised, constructive feedback for students. Start with a strength, identify areas to improve with specific examples, offer actionable strategies, keep a supportive tone, and reply in one well-structured paragraph.

Generate detailed feedback for the student named '${input.studentName}' in the class '${input.className}'.

Academic Performance (Grades):
${buildGradeLines(input.grades)}

Attendance: ${input.attendancePercentage}% (higher is better).${contextPart}`;
}

export async function generateStudentFeedback(
  input: GenerateStudentFeedbackInput
): Promise<GenerateStudentFeedbackOutput> {
  const { data } = await apiClient.post('/ai/chat/', {
    message: buildPrompt(input),
  });
  const feedback = (data?.reply || data?.response || '').toString().trim();
  if (!feedback) {
    throw new Error('Failed to generate feedback.');
  }
  return { feedback };
}
