import { ModuleScreen } from './mas/modulos/[moduleId]';

// Dock tab for the rentals module, used when it's pinned to the dock (only
// offered while the module is enabled — see lib/useDockApps). Unpinned, the
// Más menu opens /dashboard/mas/modulos/rentals instead.
export default function RentalsTab() {
  return <ModuleScreen moduleId="rentals" />;
}
