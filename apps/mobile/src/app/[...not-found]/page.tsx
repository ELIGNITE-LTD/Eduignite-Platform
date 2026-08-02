import { Error404 } from "@/app/error-pages";

export const dynamicParams = false;

// Required for `output: export` on a catch-all route.
export function generateStaticParams() {
  return [{ "not-found": ["404"] }];
}

export default function CatchAllNotFoundPage() {
  return <Error404 />;
}
