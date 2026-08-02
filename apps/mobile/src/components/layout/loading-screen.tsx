
"use client";

import { useState, useEffect } from "react";
import { Building2, Loader2 } from "lucide-react";

export function LoadingScreen() {
  const [typingText, setTypingText] = useState("");
  const fullText = "Insanely great.";

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setTypingText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F0F2F5] p-8">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="relative bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-8 text-center max-w-md border border-white">
          <div className="relative">
            <div className="absolute inset-0 bg-secondary/20 rounded-[2rem] animate-ping" />
            <div className="relative bg-primary p-6 rounded-[2rem] shadow-xl animate-[spin_4s_linear_infinite]">
              <Building2 className="w-12 h-12 text-secondary" />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="h-8">
              <p className="text-2xl font-black text-primary font-mono tracking-tighter italic">
                {typingText}<span className="animate-pulse">|</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-accent/50 px-6 py-4 rounded-2xl w-full border border-accent">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-[10px] font-black uppercase text-primary tracking-widest animate-pulse">Syncing Node Registry</span>
          </div>
        </div>
      </div>
      
      <div className="mt-12 flex items-center gap-4 opacity-30">
         <p className="text-[8px] font-black uppercase tracking-[0.4em] text-primary">EduIgnite Secure Infrastructure</p>
      </div>
    </div>
  );
}
