import type { Metadata } from "next";

import { UniversityDirectory, universityDirectoryMetadata, type Query } from "@/components/public/university-directory";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  return universityDirectoryMetadata("en", await searchParams);
}

export default async function UniversitiesPage({ searchParams }: { searchParams: Promise<Query> }) {
  return <UniversityDirectory lang="en" query={await searchParams} />;
}
