import type { Metadata } from "next";

import { UniversityDirectory, universityDirectoryMetadata, type Query } from "@/components/public/university-directory";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  return universityDirectoryMetadata("fr", await searchParams);
}

export default async function UniversitesPage({ searchParams }: { searchParams: Promise<Query> }) {
  return <UniversityDirectory lang="fr" query={await searchParams} />;
}
