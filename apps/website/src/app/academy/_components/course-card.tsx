import Link from "next/link";
import { Clock, Layers, ArrowRight, Sparkles } from "lucide-react";
import type { CourseListItem } from "@/app/academy/_lib/public-api";
import { roleLabel } from "@/app/academy/_lib/public-api";

export function CourseCard({ course }: { course: CourseListItem }) {
  return (
    <Link
      href={`/academy/courses/${course.slug}`}
      className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#67D0E4]/50 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-[#67D0E4]/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#264D73]">
          {roleLabel(course.role_pathway)}
        </span>
        {course.is_featured && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#264D73]/8 px-2.5 py-1 text-[11px] font-black text-[#264D73]">
            <Sparkles className="h-3 w-3" /> Featured
          </span>
        )}
      </div>

      <h3 className="mt-4 font-serif text-lg font-bold leading-snug text-[#12314d] group-hover:text-[#264D73]">
        {course.title}
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-600">{course.description}</p>

      <div className="mt-5 flex items-center gap-4 text-xs font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-[#67D0E4]" /> {course.module_count} module{course.module_count === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[#67D0E4]" /> {course.duration_minutes} min
        </span>
      </div>

      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73]">
        View course <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
