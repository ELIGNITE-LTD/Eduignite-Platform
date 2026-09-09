// Server wrapper so `output: export` can satisfy the dynamic segment. The real
// UI (client component in ./view) reads the id via useParams and renders
// client-side; in the Capacitor SPA navigation is client-side, so any
// survey id works at runtime. Same pattern as
// apps/mobile/src/app/dashboard/live-classes/[classId]/page.tsx.
import View from "./view";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function Page() {
  return <View />;
}
