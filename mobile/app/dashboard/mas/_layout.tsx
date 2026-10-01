import { Stack } from 'expo-router';

/**
 * Más is ONE dock tab with its own native stack — the iOS "More" pattern.
 * Everything opened from the Más menu is pushed here, so it slides in like a
 * job detail and pops with the edge swipe: Ajustes and every settings page,
 * the module store and modules, payroll.
 *
 * The dock apps (Clientes, Trabajos, Facturas, Calendario, Empleados,
 * Reportes) live at the dashboard level as tabs so they can be pinned. When
 * one ISN'T pinned, the Más menu opens its copy in THIS stack (mas/clientes,
 * mas/trabajos… re-export the same screens), so it slides too; its list →
 * detail → form links stay in this stack via lib/sectionNav.
 *
 * Shared screens tell which stack they're in via useInMoreStack (lib/sectionNav).
 */
export default function MasLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
