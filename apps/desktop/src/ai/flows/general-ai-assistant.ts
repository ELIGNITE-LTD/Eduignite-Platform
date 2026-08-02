'use server';
/**
 * @fileOverview A general-purpose AI assistant for all EduIgnite users.
 *
 * - getAiAssistantResponse - A function that handles general AI queries.
 * - AssistantInput - The input type for the assistant.
 * - AssistantOutput - The return type for the assistant.
 */

import { groqClient, GROQ_MODEL } from '@/ai/genkit';

export type AssistantInput = {
  userRole: string;
  userName: string;
  query: string;
  context?: string;
};

export type AssistantOutput = {
  response: string;
  suggestions?: string[];
};

const SYSTEM_PROMPT = `You are the EduIgnite AI, a highly intelligent and supportive educational assistant integrated into a SaaS school management platform for schools in Cameroon.

Your goal is to provide a response tailored strictly to the user's role:
1. If the user is a STUDENT: Focus on learning support, explaining concepts, or clarifying assignment requirements.
2. If the user is a TEACHER: Assist with lesson planning ideas, grading strategies, or administrative efficiency.
3. If the user is a PARENT: Provide insights on how to support their child's learning and interpret performance data.
4. If the user is a BURSAR: Assist with financial reporting, fee collection strategies, and inventory budgeting.
5. If the user is a LIBRARIAN: Help with library management system queries, book categorization, or promoting reading culture.
6. If the user is a SCHOOL_ADMIN or SUPER_ADMIN: Help with platform management, institutional health, and data insights.

Guidelines:
- Maintain a professional, empathetic, and encouraging tone.
- Keep responses concise but comprehensive.
- Format your response using clear structure (paragraphs or lists).
- After your main response, provide exactly 2-3 short follow-up suggestions separated by the delimiter " | ".
- Respond in the language of the query (English or French).

Response format (strict):
<response>
Your main response here.
</response>
<suggestions>
Suggestion one | Suggestion two | Suggestion three
</suggestions>`;

function buildUserMessage(input: AssistantInput): string {
  const contextPart = input.context
    ? `\nCurrent Context:\n${input.context}\n`
    : '';

  return `User Identity:
- Name: ${input.userName}
- Role: ${input.userRole}
${contextPart}
User Query:
${input.query}`;
}

function parseAssistantResponse(raw: string): AssistantOutput {
  const responseMatch = raw.match(/<response>([\s\S]*?)<\/response>/i);
  const suggestionsMatch = raw.match(/<suggestions>([\s\S]*?)<\/suggestions>/i);

  const response = responseMatch
    ? responseMatch[1].trim()
    : raw.trim(); // fallback: treat whole output as the response

  const suggestions = suggestionsMatch
    ? suggestionsMatch[1]
        .trim()
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return { response, suggestions };
}

export async function getAiAssistantResponse(
  input: AssistantInput
): Promise<AssistantOutput> {
  const completion = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input) },
    ],
    max_tokens: 1024,
    temperature: 0.7,
    top_p: 0.95,
  });

  const raw = (completion as any).choices?.[0]?.message?.content ?? '';
  if (!raw) {
    throw new Error('AI failed to generate a response.');
  }

  return parseAssistantResponse(raw);
}
