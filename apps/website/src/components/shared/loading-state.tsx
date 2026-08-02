
'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, Building2, ShieldCheck, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

const FRIENDLY_MESSAGES = [
  "Gathering pedagogical data...",
  "Syncing with the node registry...",
  "Authenticating secure session...",
  "Loading student dashboard... hang tight!",
  "Verifying institutional integrity...",
  "Fetching academic records... almost there!",
  "Preparing your digital workspace...",
  "Insanely great things taking shape..."
];

interface LoadingStateProps {
  message?: string;
  className?: string;
  variant?: 'full' | 'inline' | 'skeleton';
}

/**
 * A high-fidelity loading component with randomized friendly messages
 * and smooth animations.
 */
export function LoadingState({ message, className, variant = 'full' }: LoadingStateProps) {
  const [displayMessage, setDisplayMessage] = useState(message || FRIENDLY_MESSAGES[0]);

  useEffect(() => {
    if (message) return;
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * FRIENDLY_MESSAGES.length);
      setDisplayMessage(FRIENDLY_MESSAGES[randomIndex]);
    }, 3000);
    return () => clearInterval(interval);
  }, [message]);

  if (variant === 'inline') {
    return (
      <div className={cn("flex items-center gap-3 py-4 text-primary/60", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">
          {displayMessage}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-12 text-center space-y-6 animate-in fade-in duration-500",
      variant === 'full' ? "min-h-[400px]" : "",
      className
    )}>
      <div className="relative">
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse" />
        <div className="relative bg-white p-6 rounded-[2rem] shadow-xl border border-accent">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-black text-primary uppercase tracking-widest animate-pulse">
          {displayMessage}
        </p>
        <div className="flex items-center justify-center gap-2 opacity-30">
          <ShieldCheck className="w-3 h-3 text-secondary" />
          <span className="text-[8px] font-bold uppercase tracking-widest">Secure Node Link</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable Card Skeleton for consistent loading UI
 */
export function CardSkeleton() {
  return (
    <div className="bg-white rounded-[2rem] border border-accent p-6 space-y-4 shadow-sm animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent/50" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-3/4 bg-accent/50 rounded" />
          <div className="h-3 w-1/2 bg-accent/30 rounded" />
        </div>
      </div>
      <div className="space-y-3 pt-4">
        <div className="h-2 w-full bg-accent/30 rounded" />
        <div className="h-2 w-5/6 bg-accent/30 rounded" />
      </div>
      <div className="pt-4 flex justify-end">
        <div className="h-10 w-24 bg-accent/50 rounded-xl" />
      </div>
    </div>
  );
}
