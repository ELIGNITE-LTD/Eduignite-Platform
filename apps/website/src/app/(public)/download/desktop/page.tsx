import type { Metadata } from "next";
import { AppDownloadPage } from "@/components/public/app-download-page";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Download EduIgnite for Windows",
  description: "Download the EduIgnite Windows app and the account setup guide.",
};

export default function DesktopDownloadPage() {
  return <AppDownloadPage appKey="desktop" />;
}
