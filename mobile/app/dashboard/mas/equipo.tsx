import { Redirect } from 'expo-router';

// Retired: team/app-access management merged into the main Equipo page
// (/dashboard/mas/empleados). Kept as a redirect so old links resolve.
export default function EquipoRedirect() {
  return <Redirect href="/dashboard/mas/empleados" />;
}
