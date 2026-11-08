import type { Metadata } from "next";

import { StubPage, stubMetadata } from "@/components/school-site/stub-page";
import type { SchoolPageProps } from "@/lib/school-site-server";

export const generateMetadata = (props: SchoolPageProps): Promise<Metadata> => stubMetadata(props, "blog");

export default function Page(props: SchoolPageProps) {
  return <StubPage props={props} section="blog" />;
}
