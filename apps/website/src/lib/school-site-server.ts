import { cookies } from "next/headers";

import { fetchPublicSchool, type PublicSchool, type SchoolLang } from "@/lib/public-schools";
import { LANG_COOKIE, resolveLang } from "@/lib/school-site";

export type SchoolPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export type LoadedSchool = { school: PublicSchool; lang: SchoolLang; preview?: string };

/** Loads the school for a page and resolves its language and preview token. Null when there is no live (or previewable) school. */
export async function loadSchool({ params, searchParams }: SchoolPageProps): Promise<LoadedSchool | null> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const preview = typeof query.preview === "string" && query.preview ? query.preview : undefined;
  const school = await fetchPublicSchool(slug, { previewToken: preview });
  if (!school) return null;
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  return { school, lang: resolveLang(query.lang, cookieLang, school.default_language), preview };
}
