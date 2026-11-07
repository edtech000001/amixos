import { Locale } from '../locales';

export type NotificationsDict = {
  title: string;
  settingsSubtitle: string;
  empty: string;
  emptyHint: string;
  markAllRead: string;
  markRead: string;
  markUnread: string;
  longPressHint: string;
  filterAll: string;
  filterUnread: string;
  emptyUnread: string;
  groups: { today: string; yesterday: string; week: string; earlier: string };
  justNow: string;
  minutesAgo: string;   // {{n}}
  hoursAgo: string;     // {{n}}
  daysAgo: string;      // {{n}}
  prefsTitle: string;
  prefsHint: string;
  pushLabel: string;
  pushHint: string;
  categories: {
    jobs: string;
    invoices: string;
    team: string;
    inventory: string;
    account: string;
  };
  categoryHints: {
    jobs: string;
    invoices: string;
    team: string;
    inventory: string;
    account: string;
  };
  accountAlwaysOn: string;
  saveError: string;
};

export const notifications: Record<Locale, NotificationsDict> = {
  es: {
    title: 'Notificaciones',
    settingsSubtitle: 'Elige qué alertas recibes y las notificaciones push.',
    empty: 'Sin notificaciones',
    emptyHint: 'Aquí verás pagos, trabajos asignados, propuestas aceptadas y más.',
    markAllRead: 'Marcar todo como leído',
    markRead: 'Marcar como leído',
    markUnread: 'Marcar como no leído',
    longPressHint: 'Mantén presionado para marcar como leído o no leído',
    filterAll: 'Todas',
    filterUnread: 'No leídas',
    emptyUnread: 'Estás al día. No hay notificaciones sin leer.',
    groups: { today: 'Hoy', yesterday: 'Ayer', week: 'Esta semana', earlier: 'Antes' },
    justNow: 'Ahora',
    minutesAgo: 'Hace {{n}} min',
    hoursAgo: 'Hace {{n}} h',
    daysAgo: 'Hace {{n}} d',
    prefsTitle: 'Qué quieres recibir',
    prefsHint: 'Se aplica a este negocio.',
    pushLabel: 'Notificaciones push',
    pushHint: 'Alertas en tu teléfono. La campana de la app siempre se actualiza.',
    categories: {
      jobs: 'Trabajos',
      invoices: 'Facturas',
      team: 'Equipo',
      inventory: 'Inventario y equipo',
      account: 'Cuenta y suscripción',
    },
    categoryHints: {
      jobs: 'Propuestas aceptadas, trabajos asignados, cambios de fecha, trabajos completados',
      invoices: 'Facturas pagadas y vencidas',
      team: 'Nuevos miembros y salidas sin marcar',
      inventory: 'Inventario bajo, placas y seguros por vencer',
      account: 'Problemas de pago de la suscripción',
    },
    accountAlwaysOn: 'Siempre activo',
    saveError: 'No se pudo guardar. Intenta de nuevo.',
  },
  en: {
    title: 'Notifications',
    settingsSubtitle: 'Choose which alerts you get and push notifications.',
    empty: 'No notifications',
    emptyHint: 'Payments, job assignments, accepted proposals and more will show up here.',
    markAllRead: 'Mark all as read',
    markRead: 'Mark as read',
    markUnread: 'Mark as unread',
    longPressHint: 'Long-press to mark as read or unread',
    filterAll: 'All',
    filterUnread: 'Unread',
    emptyUnread: "You're all caught up. No unread notifications.",
    groups: { today: 'Today', yesterday: 'Yesterday', week: 'This week', earlier: 'Earlier' },
    justNow: 'Now',
    minutesAgo: '{{n}} min ago',
    hoursAgo: '{{n}} h ago',
    daysAgo: '{{n}} d ago',
    prefsTitle: 'What you get',
    prefsHint: 'Applies to this business.',
    pushLabel: 'Push notifications',
    pushHint: 'Alerts on your phone. The in-app bell always updates.',
    categories: {
      jobs: 'Jobs',
      invoices: 'Invoices',
      team: 'Team',
      inventory: 'Inventory & equipment',
      account: 'Account & subscription',
    },
    categoryHints: {
      jobs: 'Accepted proposals, job assignments, date changes, completed jobs',
      invoices: 'Paid and overdue invoices',
      team: 'New members and missed clock-outs',
      inventory: 'Low stock, expiring plates and insurance',
      account: 'Subscription payment problems',
    },
    accountAlwaysOn: 'Always on',
    saveError: "Couldn't save. Try again.",
  },
};
