import { Redirect } from 'expo-router';

/** A link to nowhere in the app opens Home (M6.2; docs/05 §4). */
export default function NotFound() {
  return <Redirect href="/" />;
}
