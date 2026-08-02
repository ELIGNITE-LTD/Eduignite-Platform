'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A ultra-thin YouTube-style progress bar that triggers on route changes.
 * Provides immediate high-fidelity feedback for navigation actions.
 */
export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Reset and start progress instantly on any navigation
    setIsVisible(true);
    setProgress(2); // Initial jump

    const timer = setTimeout(() => {
      setProgress(40);
    }, 100);

    const midTimer = setTimeout(() => {
      setProgress(75);
    }, 400);

    // Completion sequence
    const completionTimer = setTimeout(() => {
      setProgress(100);
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => setProgress(0), 200); // Reset for next use
      }, 300);
      return () => clearTimeout(hideTimer);
    }, 800);

    return () => {
      clearTimeout(timer);
      clearTimeout(midTimer);
      clearTimeout(completionTimer);
    };
  }, [pathname, searchParams]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-1 pointer-events-none overflow-hidden">
      <div 
        className="h-full bg-secondary transition-all duration-500 ease-out shadow-[0_0_15px_rgba(103,208,228,0.9)] relative" 
        style={{ width: `${progress}%` }}
      >
        {/* Glow effect at the tip */}
        <div className="absolute right-0 top-0 h-full w-20 bg-gradient-to-r from-transparent to-white/40 blur-sm" />
      </div>
    </div>
  );
}
