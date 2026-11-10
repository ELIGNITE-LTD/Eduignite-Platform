"use client";

import { Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function HigherMyResultsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">My results</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your results by course unit and semester.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Award className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No results published yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Results will appear here once your lecturers publish them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
