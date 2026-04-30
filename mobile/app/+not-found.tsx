import { Redirect } from 'expo-router';

// Catch-all for unmatched routes. The expo-dev-client occasionally cold-opens
// the app with a malformed deep link (e.g. amixos://host:8081/--/host:8081/--),
// which would otherwise land on the default "Unmatched Route" screen. Send
// anything unmatched back to the splash.
export default function NotFound() {
  return <Redirect href="/" />;
}
