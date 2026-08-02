// Server wrapper so `output: export` can satisfy the dynamic segment. The real
// UI (client component in ./view) reads the id via useParams and renders
// client-side; in the Capacitor SPA navigation is client-side, so any classId
// works at runtime.
import View from './view';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ classId: 'placeholder' }];
}

export default function Page() {
  return <View />;
}
