// Server wrapper so `output: export` can satisfy the dynamic [id] segment.
// The real UI (client component in ./view) reads the id via useParams and
// renders client-side; the Capacitor SPA navigates client-side, so any id
// works at runtime.
import View from './view';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page() {
  return <View />;
}
