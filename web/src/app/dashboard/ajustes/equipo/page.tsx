import { redirect } from 'next/navigation';

// Retired: team/app-access management merged into the main Equipo page
// (/dashboard/empleados). Kept as a redirect so old links/bookmarks resolve.
export default function EquipoRedirect() {
  redirect('/dashboard/empleados');
}
