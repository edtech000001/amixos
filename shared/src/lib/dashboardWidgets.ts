// Customizable dashboard widget registry — shared by web and mobile so the
// home screen stays in feature parity and the layout (saved per business in
// businesses.dashboard_layout, migration 049) syncs across devices.
//
// Module-aware by design: future industry modules register extra widgets by
// appending to DASHBOARD_WIDGETS. Ids saved in a business's layout that no
// longer exist are silently dropped, and registry widgets missing from a
// saved layout are appended at the end — so adding/removing widgets never
// requires a data migration.

export type DashboardWidgetId =
  | 'quickActions'
  | 'earningsMonth'
  | 'invoicesPending'
  | 'clientsTotal'
  | 'invoicesOverdue'
  | 'clockedIn'
  | 'earningsYear'
  | 'jobsActive'
  | 'monthlyChart'
  | 'upcomingJobs'
  | 'recentInvoices';

export type DashboardWidgetSize = 'stat' | 'full';

export interface DashboardWidgetDef {
  id: DashboardWidgetId;
  /** 'stat' = small card in the grid, 'full' = spans the whole row. */
  size: DashboardWidgetSize;
  /** Hidden unless the user adds it from the customize panel. */
  defaultHidden?: boolean;
}

// Registry order doubles as the default layout order.
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { id: 'quickActions', size: 'full' },
  { id: 'earningsMonth', size: 'stat' },
  { id: 'invoicesPending', size: 'stat' },
  { id: 'clientsTotal', size: 'stat' },
  { id: 'invoicesOverdue', size: 'stat' },
  { id: 'clockedIn', size: 'stat' },
  { id: 'earningsYear', size: 'stat' },
  { id: 'jobsActive', size: 'stat', defaultHidden: true },
  { id: 'monthlyChart', size: 'full' },
  { id: 'upcomingJobs', size: 'full' },
  { id: 'recentInvoices', size: 'full' },
];

export interface DashboardLayout {
  order: string[];
  hidden: string[];
}

export interface ResolvedDashboardLayout {
  /** Widgets to render, in display order. */
  visible: DashboardWidgetDef[];
  /** Widgets available in the "add widget" panel. */
  hidden: DashboardWidgetDef[];
}

const byId = new Map(DASHBOARD_WIDGETS.map((w) => [w.id as string, w]));

export function resolveDashboardLayout(
  layout: DashboardLayout | null | undefined,
): ResolvedDashboardLayout {
  const order = layout?.order?.filter((id) => byId.has(id)) ?? [];
  const hiddenIds = new Set(
    layout
      ? (layout.hidden ?? []).filter((id) => byId.has(id))
      : DASHBOARD_WIDGETS.filter((w) => w.defaultHidden).map((w) => w.id),
  );

  // Saved order first, then any registry widgets it doesn't know about yet.
  const ordered = [
    ...order,
    ...DASHBOARD_WIDGETS.map((w) => w.id).filter((id) => !order.includes(id)),
  ].map((id) => byId.get(id)!);

  return {
    visible: ordered.filter((w) => !hiddenIds.has(w.id)),
    hidden: ordered.filter((w) => hiddenIds.has(w.id)),
  };
}

/** Serialize the current visible order + hidden set back into the JSONB shape. */
export function buildDashboardLayout(
  visibleIds: string[],
  hiddenIds: string[],
): DashboardLayout {
  return { order: [...visibleIds, ...hiddenIds], hidden: hiddenIds };
}
