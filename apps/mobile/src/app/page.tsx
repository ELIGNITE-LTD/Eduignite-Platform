
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    
    if (isAuthenticated && user) {
      if (user.role === "SUPER_ADMIN") {
        router.push("/dashboard");
      } else {
        router.push("/welcome");
      }
    } else {
      router.push("/login");
    }
  }, [isAuthenticated, user, isLoading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-primary font-medium">Initializing EduIgnite...</p>
      </div>
    </div>
  );
}
