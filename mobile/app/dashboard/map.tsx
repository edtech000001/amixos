import { ModuleScreen } from './mas/modulos/[moduleId]';

// Dock tab for the map module, used when it's pinned to the dock (only
// offered while the module is enabled — see lib/useDockApps). Unpinned, the
// Más menu opens /dashboard/mas/modulos/map instead.
export default function MapTab() {
  return <ModuleScreen moduleId="map" />;
}
