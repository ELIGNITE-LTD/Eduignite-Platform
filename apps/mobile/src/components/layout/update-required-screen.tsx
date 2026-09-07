"use client";

import { DownloadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Blocking, non-dismissible "you must update" screen shown when the app's
 * own baked-in version has fallen below the platform's `minSupportedVersion`.
 * Mirrors the "Dashboard Locked" full-screen card in
 * @/app/dashboard/layout.tsx so it reads as the same kind of hard gate.
 */
export function UpdateRequiredScreen({ downloadUrl }: { downloadUrl: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-accent/10">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-primary p-6 sm:p-8 text-white text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-white/10 rounded-full">
                <DownloadCloud className="w-12 h-12 text-secondary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black uppercase">Update Required</CardTitle>
            <CardDescription className="text-white/60">
              This version of EduIgnite is no longer supported
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 text-center space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              An update is required to continue using EduIgnite. Please download and install the
              latest version to keep going.
            </p>
            <Button
              asChild
              className="w-full h-14 rounded-2xl shadow-lg font-black uppercase tracking-widest text-xs gap-2"
            >
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <DownloadCloud className="w-5 h-5" /> Download the Update
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
