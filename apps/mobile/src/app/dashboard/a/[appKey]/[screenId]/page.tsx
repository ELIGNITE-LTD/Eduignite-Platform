// Server wrapper so `output: export` can satisfy the dynamic segments. The real
// UI (client component in ./view) reads appKey/screenId via useParams and runs
// client-side; Capacitor navigation is client-side, so any app screen works.
import View from './view';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ appKey: 'placeholder', screenId: 'placeholder' }];
}

export default function Page() {
  return <View />;
}
