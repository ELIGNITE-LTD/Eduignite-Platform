import type { Metadata } from "next";
import { AppDownloadPage } from "@/components/public/app-download-page";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Download EduIgnite for Android",
  description: "Download the EduIgnite Android app and the account setup guide.",
};

export default function MobileDownloadPage() {
  return <AppDownloadPage appKey="mobile" />;
}
