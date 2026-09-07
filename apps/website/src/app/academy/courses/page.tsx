import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import {
  fetchCourses,
  roleLabel,
  ROLE_PATHWAYS,
  type RolePathway,
} from "@/app/academy/_lib/public-api";
import { AcademySiteFrame } from "@/app/academy/_components/site-frame";
import { CourseCard } from "@/app/academy/_components/course-card";
import { Section, PageHero, EmptyNotice } from "@/components/public/sections";
import { Reveal } from "@/components/public/motion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Course Catalog | EduIgnite Academy",
  description:
    "Browse the full EduIgnite Academy catalog — role-based, task-oriented courses for Principals, Teachers, Accountants, Librarians and every EduIgnite user. Free to browse, no login required.",
};

// The catalog is live content (courses can be published/unpublished/featured
// at any time from the Academy CMS) — same 5-minute cadence as the landing
// page's featured section, never a stale hardcoded list.
export const revalidate = 300;

const VALID_PATHWAYS = new Set(ROLE_PATHWAYS.map((p) => p.value));

function isRolePathway(value: string | undefined): value is RolePathway {
  return !!value && VALID_PATHWAYS.has(value as RolePathway);
}

type SearchParams = Promise<{ role_pathway?: string }>;

export default async function CourseCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolved = await searchParams;
  const activePathway = isRolePathway(resolved.role_pathway) ? resolved.role_pathway : undefined;

  const courses = await fetchCourses(activePathway ? { role_pathway: activePathway } : undefined);

  return (
    <AcademySiteFrame>
      <PageHero
        eyebrow="Course catalog"
        title={activePathway ? `Courses for ${roleLabel(activePathway)}` : "The full EduIgnite Academy catalog"}
        blurb="Every course maps to a real EduIgnite role. Filter by pathway to find the training that matches what you actually do on the platform — browse freely, no login required."
      />

      <Section surface="light">
        {/* Role pathway filter — plain links with query params, so this stays
           a server-rendered page (no client JS needed to filter). */}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/academy/courses"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors",
              !activePathway
                ? "border-[#264D73] bg-[#264D73] text-white"
                : "border-slate-200 bg-white text-[#264D73] hover:border-[#67D0E4]/60 hover:bg-[#67D0E4]/10"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> All courses
          </Link>
          {ROLE_PATHWAYS.map((pathway) => (
            <Link
              key={pathway.value}
              href={`/academy/courses?role_pathway=${pathway.value}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors",
                activePathway === pathway.value
                  ? "border-[#264D73] bg-[#264D73] text-white"
                  : "border-slate-200 bg-white text-[#264D73] hover:border-[#67D0E4]/60 hover:bg-[#67D0E4]/10"
              )}
            >
              {pathway.label}
            </Link>
          ))}
        </div>

        <div className="mt-12">
          {courses.length === 0 ? (
            <EmptyNotice
              title={activePathway ? `No published courses for ${roleLabel(activePathway)} yet` : "No courses published yet"}
              hint="Courses appear here the moment they're approved and published in the Academy CMS. Check back soon, or browse another pathway."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course, i) => (
                <Reveal key={course.slug} delay={(i % 3) * 80}>
                  <CourseCard course={course} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </Section>
    </AcademySiteFrame>
  );
}
