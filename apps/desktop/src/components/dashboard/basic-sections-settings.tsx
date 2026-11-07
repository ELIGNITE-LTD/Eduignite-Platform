"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useSchoolSettings, useUpdateSchoolSettings } from "@/lib/hooks/useSchools";

const CHOICES: Record<string, { label: string; sections: string[] }> = {
  both: { label: "Nursery and Primary", sections: ["nursery", "primary"] },
  nursery: { label: "Nursery only", sections: ["nursery"] },
  primary: { label: "Primary only", sections: ["primary"] },
};

function choiceFor(sections?: string[]) {
  const set = new Set(sections ?? []);
  if (set.has("nursery") && !set.has("primary")) return "nursery";
  if (set.has("primary") && !set.has("nursery")) return "primary";
  return "both";
}

/** Lets a basic school's admin choose which sections it runs. */
export function BasicSectionsSettings({ schoolId }: { schoolId: string }) {
  const { toast } = useToast();
  const { data: settings } = useSchoolSettings(schoolId);
  const updateSettings = useUpdateSchoolSettings();
  const [choice, setChoice] = useState("both");

  useEffect(() => {
    setChoice(choiceFor(settings?.sections));
  }, [settings?.sections]);

  const save = async () => {
    try {
      await updateSettings.mutateAsync({ id: schoolId, data: { sections: CHOICES[choice].sections } });
      toast({ title: "Sections saved", description: CHOICES[choice].label });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save sections", description: getApiErrorMessage(error) });
    }
  };

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader>
        <CardTitle>Basic Education sections</CardTitle>
        <CardDescription>Choose which sections this school runs.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger className="h-11 rounded-xl sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CHOICES).map(([value, c]) => (
              <SelectItem key={value} value={value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={updateSettings.isPending} className="rounded-xl">
          {updateSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
