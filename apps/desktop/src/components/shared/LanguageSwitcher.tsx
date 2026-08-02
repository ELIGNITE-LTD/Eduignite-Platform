"use client";

import { LANGUAGE_STORAGE_KEY, useI18n, type Language } from "@/lib/i18n-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage } = useI18n();

  const choose = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    }
  };

  return (
    <div className={cn("inline-flex rounded-xl bg-primary/5 p-1", className)}>
      {(["en", "fr"] as const).map((code) => (
        <Button
          key={code}
          type="button"
          size="sm"
          variant={language === code ? "default" : "ghost"}
          className="h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest"
          onClick={() => choose(code)}
        >
          {code.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
