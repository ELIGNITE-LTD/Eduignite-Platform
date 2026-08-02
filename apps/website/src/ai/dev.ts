/**
 * Development entry-point for AI flows.
 * Previously used by Genkit CLI — kept as a simple import check so that
 * both flow modules are transpiled together during local type-checking.
 */
import { config } from 'dotenv';
config();

// Importing the flow modules triggers any top-level validation.
import '@/ai/flows/teacher-ai-feedback-generation';
import '@/ai/flows/general-ai-assistant';
