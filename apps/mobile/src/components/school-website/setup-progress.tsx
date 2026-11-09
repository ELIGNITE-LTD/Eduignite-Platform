"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { Section, useTr, type TabProps } from "./shared";

/**
 * "Setup progress" checklist across every tab of the website manager.
 *
 * Items for features whose management endpoint is not deployed (404/405) are
 * hidden, so this works before and after the Leadership, Events, Gallery and
 * Blog tabs ship. Counts come from the server; nothing is guessed.
 */

type Probe = { available: boolean; count: number };

/** Number of rows a management list endpoint returns; `available:false` when the endpoint does not exist. */
function useFeatureProbe(path: string) {
  return useQuery<Probe>({
    queryKey: ["public-site", "progress", path],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data } = await apiClient.get(`/schools/public-site/${path}/`, { params: { limit: 1, page_size: 1 } });
        const count = Array.isArray(data) ? data.length : typeof data?.count === "number" ? data.count : Array.isArray(data?.results) ? data.results.length : 0;
        return { available: true, count };
      } catch {
        return { available: false, count: 0 };
      }
    },
  });
}

type Row = { key: string; label: string; done: boolean; note?: string; tab?: string; hidden?: boolean };

export function SetupProgress({ profile, goTo }: Pick<TabProps, "profile" | "goTo">) {
  const tr = useTr();
  const leadership = useFeatureProbe("leadership");
  const events = useFeatureProbe("events");
  const gallery = useFeatureProbe("gallery");
  const blog = useFeatureProbe("blog");
  const admissions = useQuery<{ window_state: string } | null>({
    queryKey: ["public-site", "progress", "admissions"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return (await apiClient.get("/schools/admissions/settings/")).data;
      } catch {
        return null;
      }
    },
  });

  const filled = (...v: Array<string | undefined>) => v.some((x) => (x ?? "").trim().length > 0);
  const enrolOn = profile.enrollment_enabled;
  const windowState = admissions.data?.window_state;
  const enrollNote = !enrolOn
    ? tr("Not set up", "Non configure")
    : windowState && windowState !== "open"
      ? tr("Closed", "Fermee")
      : tr("Open", "Ouverte");

  const feature = (probe: ReturnType<typeof useFeatureProbe>, key: string, label: string, tab: string): Row => ({
    key, label, tab, done: (probe.data?.count ?? 0) > 0, hidden: !probe.data?.available,
  });

  const rows: Row[] = [
    {
      key: "identity", tab: "identity", label: tr("Identity & branding", "Identite et image"),
      done: profile.school.has_logo && filled(profile.school.description, profile.vision_en, profile.vision_fr, profile.mission_en, profile.mission_fr),
    },
    { key: "contact", tab: "contact", label: tr("Contact details", "Coordonnees"), done: filled(profile.school.email, profile.school.phone) },
    {
      key: "seo", tab: "seo", label: tr("SEO settings", "Referencement (SEO)"),
      done: filled(profile.meta_title_en, profile.meta_title_fr) && filled(profile.meta_description_en, profile.meta_description_fr),
    },
    feature(leadership, "leadership", tr("Leadership", "Direction"), "leadership"),
    feature(events, "events", tr("Events", "Evenements"), "events"),
    feature(gallery, "gallery", tr("Gallery", "Galerie"), "gallery"),
    feature(blog, "blog", tr("Blog", "Blog"), "blog"),
    { key: "enrollment", tab: "enrollment", label: tr("Enrollment", "Inscription"), note: enrollNote, done: enrolOn && (!windowState || windowState === "open") },
    { key: "publish", tab: "publication", label: tr("Publish", "Publication"), done: profile.publication_status === "published" },
  ];
  const shown = rows.filter((r) => !r.hidden);
  const doneCount = shown.filter((r) => r.done).length;

  return (
    <Section
      title={tr("Setup progress", "Progression de la configuration")}
      description={tr(`${doneCount} of ${shown.length} steps complete.`, `${doneCount} etape(s) sur ${shown.length} terminee(s).`)}
    >
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${shown.length ? (doneCount / shown.length) * 100 : 0}%` }} />
      </div>
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.key} className="flex items-center gap-3">
            {r.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
            <span className="flex-1 text-sm font-medium">
              {r.label}
              {r.note ? <span className="ml-2 text-xs font-normal text-muted-foreground">{r.note}</span> : null}
            </span>
            {r.tab && !r.done ? (
              <Button size="sm" variant="secondary" onClick={() => goTo(r.tab!)}>{tr("Open", "Ouvrir")}</Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
