"use client";

import { useState } from "react";
import { usePublicSiteProfile } from "@/lib/hooks/usePublicSite";
import { useAuth } from "@/lib/auth-context";
import { useRoleLabel } from "@/lib/role-labels";
import { LoadError } from "@/components/ui/load-error";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Hourglass } from "lucide-react";
import { Section, StatusChip, useTr, type TabProps } from "./shared";
import { OverviewTab } from "./overview-tab";
import { IdentityTab } from "./identity-tab";
import { ContactTab, SeoTab } from "./contact-seo-tabs";
import { AuditTab, PublicationTab } from "./publication-audit-tabs";
import { LeadershipTab } from "./leadership-tab";
import { BlogTab } from "./blog-tab";
import { EnrollmentTab } from "./enrollment-tab";

/** Tabs whose backend has not landed yet. Listed honestly rather than faked. */
const COMING_SOON: Array<{ key: string; en: string; fr: string; descEn: string; descFr: string }> = [
  { key: "events", en: "Events", fr: "Evenements", descEn: "Choose which school events appear publicly.", descFr: "Choisir les evenements de l'ecole visibles publiquement." },
  { key: "gallery", en: "Gallery", fr: "Galerie", descEn: "Photo albums of campus life.", descFr: "Albums photo de la vie de l'ecole." },
];

function ComingSoon({ item }: { item: (typeof COMING_SOON)[number] }) {
  const tr = useTr();
  return (
    <Section title={tr(item.en, item.fr)}>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <Hourglass className="h-8 w-8 text-muted-foreground" />
        <p className="text-base font-semibold">{tr("Coming soon", "Bientot disponible")}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {tr(item.descEn, item.descFr)}{" "}
          {tr("This section is not available yet. Nothing is shown on your website for it.", "Cette section n'est pas encore disponible. Rien n'est affiche a ce sujet sur votre site.")}
        </p>
      </div>
    </Section>
  );
}

export function SchoolWebsiteManager() {
  const tr = useTr();
  const { user } = useAuth();
  const { label: roleName } = useRoleLabel();
  const query = usePublicSiteProfile();
  const [tab, setTab] = useState("overview");
  const readOnly = user?.role === "SUB_ADMIN";

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <LoadError message={tr("Could not load your website settings.", "Impossible de charger les parametres de votre site.")} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  }

  const profile = query.data;
  const props: TabProps = { profile, readOnly, goTo: setTab };
  const active = [
    ["overview", tr("Overview", "Apercu general")],
    ["identity", tr("Identity & Branding", "Identite et image")],
    ["contact", tr("Contact visibility", "Visibilite des contacts")],
    ["enrollment", tr("Enrollment", "Inscription")],
    ["seo", tr("SEO Settings", "Referencement (SEO)")],
    ["leadership", tr("Leadership", "Direction")],
    ["blog", tr("Blog", "Blog")],
    ["publication", tr("Preview & Publication", "Apercu et publication")],
    ["audit", tr("Auditing", "Historique")],
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-bold text-primary sm:text-3xl">{tr("School Website", "Site web de l'ecole")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr("Manage the public website of", "Gerez le site public de")} <strong>{profile.school.name}</strong>.{" "}
            {readOnly ? tr("View only.", "Consultation seule.") : roleName(user?.role, user)}
          </p>
        </div>
        <StatusChip status={profile.publication_status} live={profile.is_live} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-max min-w-full justify-start gap-1 p-1">
            {active.map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="whitespace-nowrap">{label}</TabsTrigger>
            ))}
            {COMING_SOON.map((item) => (
              <TabsTrigger key={item.key} value={item.key} className="gap-1.5 whitespace-nowrap text-muted-foreground">
                {tr(item.en, item.fr)}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{tr("Soon", "Bientot")}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6">
          <TabsContent value="overview"><OverviewTab {...props} /></TabsContent>
          <TabsContent value="identity"><IdentityTab {...props} /></TabsContent>
          <TabsContent value="contact"><ContactTab {...props} /></TabsContent>
          <TabsContent value="enrollment"><EnrollmentTab {...props} /></TabsContent>
          <TabsContent value="seo"><SeoTab {...props} /></TabsContent>
          <TabsContent value="leadership"><LeadershipTab {...props} /></TabsContent>
          <TabsContent value="blog"><BlogTab {...props} /></TabsContent>
          <TabsContent value="publication"><PublicationTab {...props} /></TabsContent>
          <TabsContent value="audit"><AuditTab {...props} /></TabsContent>
          {COMING_SOON.map((item) => (
            <TabsContent key={item.key} value={item.key}><ComingSoon item={item} /></TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
