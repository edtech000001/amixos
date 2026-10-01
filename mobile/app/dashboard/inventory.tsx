import { ModuleScreen } from './mas/modulos/[moduleId]';

// Dock tab for the inventory module, used when it's pinned to the dock (only
// offered while the module is enabled — see lib/useDockApps). Unpinned, the
// Más menu opens /dashboard/mas/modulos/inventory instead.
export default function InventoryTab() {
  return <ModuleScreen moduleId="inventory" />;
}
