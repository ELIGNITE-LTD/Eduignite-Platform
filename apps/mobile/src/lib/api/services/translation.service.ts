import axios from "axios";
import { BASE_URL } from "../client";

export type TranslationLanguage = "en" | "fr";

export interface TranslateBatchResponse {
  translations: string[];
  provider: "LibreTranslate" | string;
  cached?: boolean;
  fallback?: boolean;
}

const API_ROOT = BASE_URL.replace(/\/api\/v1\/?$/, "/api");

export const translationService = {
  async translateBatch(
    texts: string[],
    targetLanguage: TranslationLanguage,
    sourceLanguage: TranslationLanguage = "en"
  ): Promise<TranslateBatchResponse> {
    try {
      const { data } = await axios.post(`${API_ROOT}/translate`, {
        texts,
        target_language: targetLanguage,
        source_language: sourceLanguage,
      }, { timeout: 15000 });
      return {
        translations: Array.isArray(data?.translations) ? data.translations : texts,
        provider: data?.provider || "LibreTranslate",
        cached: Boolean(data?.cached),
        fallback: Boolean(data?.fallback),
      };
    } catch {
      return {
        translations: texts,
        provider: "local-fallback",
        cached: false,
        fallback: true,
      };
    }
  },
};
