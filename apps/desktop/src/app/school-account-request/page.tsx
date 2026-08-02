"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { ordersService } from "@/lib/api/services/orders.service";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

const regions = [
  "Adamawa",
  "Centre",
  "East",
  "Far North",
  "Littoral",
  "North",
  "North West",
  "West",
  "South",
  "South West",
];

type RequestForm = {
  full_name: string;
  occupation: string;
  school_name: string;
  whatsapp_number: string;
  email: string;
  region: string;
  division: string;
  sub_division: string;
  message: string;
};

const initialForm: RequestForm = {
  full_name: "",
  occupation: "",
  school_name: "",
  whatsapp_number: "",
  email: "",
  region: "",
  division: "",
  sub_division: "",
  message: "",
};

export default function SchoolAccountRequestPage() {
  const { platformSettings } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<RequestForm>(initialForm);
  const [source, setSource] = useState("direct");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const platformName = platformSettings.name || "EduIgnite";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSource(params.get("source") || "direct");
  }, []);

  const message = useMemo(() => {
    const note = form.message.trim();
    const sourceLine = `Request source: ${source}.`;
    return note ? `${note}\n\n${sourceLine}` : sourceLine;
  }, [form.message, source]);

  const updateForm = (key: keyof RequestForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await ordersService.createOrder({ ...form, message });
      setSubmitted(true);
      setForm(initialForm);
      toast({
        title: "Request submitted",
        description: "The EduIgnite founder office will review your school request and contact you.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: getApiErrorMessage(error, "We could not submit the request right now."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary p-2 shadow-sm">
              <img src={platformLogo} alt={`${platformName} logo`} className="h-full w-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black text-primary">{platformName}</span>
              <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                School account request
              </span>
            </span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-primary sm:text-4xl">Request a school account</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            Fill this form with your official school information. The request goes directly to the EduIgnite
            founder office, which will review it and contact you.
          </p>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader>
            <CardTitle>School details</CardTitle>
            <CardDescription>Use official information so the founder office can verify and contact you quickly.</CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
                <div className="flex items-center gap-3 font-black">
                  <CheckCircle2 className="h-5 w-5" />
                  Request received
                </div>
                <p className="mt-2 text-sm leading-7">
                  Thank you. The EduIgnite founder office will review the request and contact the school representative.
                </p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full-name">Representative full name</Label>
                <Input id="full-name" required value={form.full_name} onChange={(event) => updateForm("full_name", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Role / occupation</Label>
                <Select value={form.occupation} onValueChange={(value) => updateForm("occupation", value)}>
                  <SelectTrigger id="occupation"><SelectValue placeholder="Choose your role" /></SelectTrigger>
                  <SelectContent>
                    {["Proprietor", "Principal", "Vice Principal", "School Administrator", "ICT Coordinator", "Bursar", "Teacher", "Other"].map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="school-name">School name</Label>
                <Input id="school-name" required value={form.school_name} onChange={(event) => updateForm("school_name", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Official email</Label>
                <Input id="email" required type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp number</Label>
                <Input id="whatsapp" required value={form.whatsapp_number} onChange={(event) => updateForm("whatsapp_number", event.target.value)} placeholder="+237..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Select value={form.region} onValueChange={(value) => updateForm("region", value)}>
                  <SelectTrigger id="region"><SelectValue placeholder="Choose region" /></SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => <SelectItem key={region} value={region}>{region}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="division">Division</Label>
                <Input id="division" required value={form.division} onChange={(event) => updateForm("division", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sub-division">Sub-division / town</Label>
                <Input id="sub-division" required value={form.sub_division} onChange={(event) => updateForm("sub_division", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="message">What should we know before contacting you? (optional)</Label>
                <Textarea id="message" value={form.message} onChange={(event) => updateForm("message", event.target.value)} placeholder="Example: We are a bilingual secondary school and want to digitize fees, report cards and parent follow-up." />
              </div>
              <Button disabled={isSubmitting || !form.occupation || !form.region} className="h-12 rounded-xl font-black md:col-span-2">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Submit school request
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
