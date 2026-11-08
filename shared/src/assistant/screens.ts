import type { AssistantClientAction } from './types';

type Navigate = Extract<AssistantClientAction, { type: 'navigate' }>;

/** Route for an Ami "open_screen" action. `section(key)` resolves a dock
 *  section's base path — web: `/dashboard/<key>`; mobile: its tab when pinned,
 *  else its Más copy (useAppHref). */
export function assistantScreenHref(
  a: Navigate,
  platform: 'web' | 'native',
  section: (key: string) => string,
): string {
  const web = platform === 'web';
  switch (a.screen) {
    case 'home': return '/dashboard';
    case 'jobs': return section('trabajos');
    case 'invoices': return section('facturas');
    case 'clients': return section('clientes');
    case 'calendar': return section('calendario');
    case 'employees': return section('empleados');
    case 'reports': return section('reportes');
    case 'map': return web ? '/dashboard/modulos/map' : section('map');
    case 'settings': return web ? '/dashboard/ajustes' : '/dashboard/mas/ajustes';
    case 'notifications': return '/dashboard/notificaciones';
    case 'payroll': return web ? '/dashboard/reportes/nomina' : '/dashboard/mas/nomina';
    case 'job': return `${section('trabajos')}/${a.id}`;
    case 'invoice': return `${section('facturas')}/${a.id}`;
    case 'client': return `${section('clientes')}/${a.id}`;
  }
}
