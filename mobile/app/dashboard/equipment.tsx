import { ModuleScreen } from './mas/modulos/[moduleId]';

// Dock tab for the equipment module, used when it's pinned to the dock (only
// offered while the module is enabled — see lib/useDockApps). Unpinned, the
// Más menu opens /dashboard/mas/modulos/equipment instead.
export default function EquipmentTab() {
  return <ModuleScreen moduleId="equipment" />;
}
