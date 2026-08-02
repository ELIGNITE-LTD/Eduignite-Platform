"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Award, Calendar, BookOpen, ChevronRight, Trophy, AlertCircle, Loader2, Baby } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { useAuth } from "@/lib/auth-context";
import { useMyChildren } from "@/lib/hooks/useStudents";
import { resolveMediaUrl } from "@/lib/media";

export default function ChildrenPage() {
  const { language } = useI18n();
  const { platformSettings } = useAuth();
  const { data: childrenResp, isLoading } = useMyChildren();
  const threshold = platformSettings.honourRollThreshold || 12.0;
  const children = childrenResp?.results ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">
          {language === "en" ? "My Children" : "Mes Enfants"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {language === "en"
            ? "Strategic oversight of your children's pedagogical progress."
            : "Surveillance strategique des progres pedagogiques de vos enfants."}
        </p>
      </div>

      {isLoading ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex h-48 items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {language === "en" ? "Loading linked children..." : "Chargement des enfants lies..."}
            </span>
          </CardContent>
        </Card>
      ) : children.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex h-56 flex-col items-center justify-center gap-4 text-center">
            <Baby className="h-12 w-12 text-primary/30" />
            <div>
              <p className="font-bold text-primary">
                {language === "en" ? "No linked children yet" : "Aucun enfant lie pour le moment"}
              </p>
              <p className="text-sm text-muted-foreground">
                {language === "en"
                  ? "Once the school links your parent account to a student, their dossier will appear here."
                  : "Des que l'ecole relie votre compte parent a un eleve, son dossier apparaitra ici."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {children.map((child) => {
            const average = Number(child.annual_average || 0);
            const isHonourRoll = average >= threshold;
            const childId = child.id || child.admission_number || child.user?.matricule;
            return (
              <Card key={child.id} className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-shadow bg-white rounded-[2rem]">
                <CardHeader className="flex flex-row items-center gap-4 bg-accent/30 p-8">
                  <div className="w-24 h-24 rounded-[2rem] overflow-hidden border-4 border-white shadow-xl shrink-0 group-hover:scale-105 transition-transform bg-primary/5">
                    {resolveMediaUrl(child.user?.avatar) ? (
                      <img src={resolveMediaUrl(child.user?.avatar) || ""} alt={child.user?.name} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-2xl font-black text-primary uppercase leading-tight">
                        {child.user?.name}
                      </CardTitle>
                      {isHonourRoll && <Trophy className="w-5 h-5 text-secondary fill-secondary/20" />}
                    </div>
                    <CardDescription className="font-bold text-primary/60 uppercase text-xs tracking-widest">
                      {child.user?.matricule || child.admission_number} • {child.school_class_name || child.student_class}
                    </CardDescription>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {isHonourRoll ? (
                        <Badge className="bg-primary text-secondary border-none font-black uppercase text-[9px] px-3 h-6 gap-1.5">
                          <Trophy className="w-3 h-3" /> HONOUR ROLL
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground border-primary/10 text-[9px] font-bold uppercase h-6 gap-1.5 bg-white">
                          <AlertCircle className="w-3 h-3" /> NOT YET ELIGIBLE
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-accent/20 p-4 rounded-2xl border border-accent">
                      <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1.5 mb-1">
                        <Award className="w-3.5 h-3.5 text-secondary" /> {language === "en" ? "Annual Average" : "Moyenne Annuelle"}
                      </p>
                      <p className="text-2xl font-black text-primary">
                        {average.toFixed(2)} <span className="text-xs opacity-40">/ 20</span>
                      </p>
                    </div>
                    <div className="bg-accent/20 p-4 rounded-2xl border border-accent">
                      <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest flex items-center gap-1.5 mb-1">
                        <Calendar className="w-3.5 h-3.5 text-secondary" /> {language === "en" ? "Admission" : "Admission"}
                      </p>
                      <p className="text-lg font-black text-primary">{child.admission_date || "—"}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest mb-1 flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3" /> {language === "en" ? "Guardian Contact" : "Contact Tuteur"}
                    </p>
                    <p className="font-bold text-primary text-sm">{child.guardian_name || "Not recorded yet"}</p>
                    <p className="text-xs text-muted-foreground">{child.guardian_phone || child.guardian_whatsapp || "No contact on file"}</p>
                  </div>

                  <Button className="w-full h-14 rounded-2xl shadow-xl font-black uppercase tracking-widest text-xs gap-3 group bg-primary text-white" asChild>
                    <Link href={`/dashboard/children/view?id=${childId}`}>
                      Open Full Dossier
                      <div className="bg-secondary p-1.5 rounded-lg group-hover:translate-x-1 transition-transform">
                        <ChevronRight className="w-4 h-4 text-primary" />
                      </div>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
