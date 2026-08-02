/**
 * Groq client — replaces the old Google Genkit / Gemini integration.
 *
 * Usage:
 *   import { groqClient, GROQ_MODEL } from '@/ai/genkit';
 *   const completion = await groqClient.chat.completions.create({ ... });
 *
 * The API key is read from the GROQ_API_KEY environment variable.
 * On the server (Next.js Server Actions / Route Handlers) this is available
 * as a plain `process.env` variable. Never expose it to the browser.
 */

import Groq from 'groq-sdk';

export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

// Lazily instantiated so the module is safe to import in test environments
// where the key may be absent.
let _client: Groq | null = null;

export function getGroqClient(): Groq {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GROQ_API_KEY environment variable is not set. ' +
          'Add it to .env.local (frontend) and make sure it is forwarded to ' +
          'Next.js Server Actions at runtime.'
      );
    }
    _client = new Groq({ apiKey });
  }
  return _client;
}

/** Convenience re-export so callers can do `import { groqClient } from '@/ai/genkit'` */
export const groqClient = {
  chat: {
    completions: {
      create: (params: Parameters<Groq['chat']['completions']['create']>[0]) =>
        getGroqClient().chat.completions.create(params),
    },
  },
};
