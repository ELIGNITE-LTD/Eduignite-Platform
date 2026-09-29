import type { Metadata } from "next";
import { pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import { AppDownloadPage } from "@/components/public/app-download-page";

export const revalidate = 900;

const PAGE = {
  title: "EduIgnite Desktop | Windows App for School Administrators",
  description:
    "Download EduIgnite Desktop for Windows — the administrator's command centre to manage the whole school, print report cards and ID cards, and keep working when the internet drops.",
  path: "/download/desktop",
};

export const metadata: Metadata = pageMetadata(PAGE);

export default function DesktopDownloadPage() {
  return (
    <>
      <JsonLd data={schemaGraph(webPageSchema({ name: PAGE.title, description: PAGE.description, path: PAGE.path, crumbs: [{ name: "Home", path: "/" }, { name: "Apps", path: "/download" }, { name: "EduIgnite Desktop", path: "/download/desktop" }] }))} />
      <AppDownloadPage appKey="desktop" />
    </>
  );
}
