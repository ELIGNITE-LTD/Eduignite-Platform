import type { Metadata } from "next";

// A page the server's PDF renderer prints. Nothing here is for search engines.
export const metadata: Metadata = {
  title: "EduIgnite AI answer",
  robots: { index: false, follow: false },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return children;
}
