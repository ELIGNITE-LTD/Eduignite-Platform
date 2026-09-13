// Server wrapper so `output: export` can satisfy the dynamic segment --
// same pattern as apps/mobile/src/app/dashboard/live-classes/[classId]/page.tsx
// and apps/offline-companion/src/app/surveys/[id]/page.tsx.
import View from "./view";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function Page() {
  return <View />;
}
