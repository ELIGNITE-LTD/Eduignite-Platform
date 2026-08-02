"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGE_STORAGE_KEY, useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  tone?: "light" | "dark";
}

/**
 * Provider-backed language switcher. It never injects third-party browser scripts.
 */
export function LanguageSwitcher({ className, tone = "light" }: LanguageSwitcherProps) {
  const { language, setLanguage } = useI18n();

  const handleLanguageChange = (lang: "en" | "fr") => {
    setLanguage(lang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-10 gap-2 rounded-xl px-3 text-[10px] font-black uppercase tracking-widest",
            tone === "dark" ? "text-white hover:bg-white/10 hover:text-white" : "text-primary hover:bg-primary/5",
            className
          )}
          aria-label="Change language"
          title={language === "fr" ? "Changer la langue" : "Change language"}
          data-eduignite-i18n-ignore="true"
        >
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline">{language === "fr" ? "Français" : "English"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40" data-eduignite-i18n-ignore="true">
        <DropdownMenuItem
          onClick={() => handleLanguageChange("en")}
          className={language === "en" ? "bg-accent" : ""}
        >
          <span className="flex items-center gap-2">
            <span className="w-6 rounded-md bg-primary/5 px-1.5 py-0.5 text-[10px] font-black text-primary">EN</span>
            English
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleLanguageChange("fr")}
          className={language === "fr" ? "bg-accent" : ""}
        >
          <span className="flex items-center gap-2">
            <span className="w-6 rounded-md bg-primary/5 px-1.5 py-0.5 text-[10px] font-black text-primary">FR</span>
            Français
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
