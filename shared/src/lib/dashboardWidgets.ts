// Customizable dashboard widget registry — shared by web and mobile so the
// home screen stays in feature parity and the layout (saved per business in
// businesses.dashboard_layout, migration 049) syncs across devices.
//
// Module-aware by design: future industry modules register extra widgets by
// appending to DASHBOARD_WIDGETS. Ids saved in a business's layout that no
// longer exist are silently dropped, and registry widgets missing from a
// saved layout are appended at the end — so adding/removing widgets never
// requires a data migration.
//
// Every widget supports three sizes. Size changes both the footprint AND
// the content density (each renderer decides what to show per size):
//   sm — compact tile  (web: 1/3 row · mobile: half width)
//   md — wide tile     (web: 1/2 row · mobile: full width)
//   lg — full row, expanded content
// Layouts saved before sizes existed simply omit `sizes` — defaults apply.

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

export type DashboardWidgetSize = 'sm' | 'md' | 'lg';

export const DASHBOARD_WIDGET_SIZES: DashboardWidgetSize[] = ['sm', 'md', 'lg'];

export interface DashboardWidgetDef {
  id: DashboardWidgetId;
  defaultSize: DashboardWidgetSize;
  /** Hidden unless the user adds it from the customize panel. */
  defaultHidden?: boolean;
}

// Registry order doubles as the default layout order.
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { id: 'quickActions', defaultSize: 'lg' },
  { id: 'earningsMonth', defaultSize: 'sm' },
  { id: 'invoicesPending', defaultSize: 'sm' },
  { id: 'clientsTotal', defaultSize: 'sm' },
  { id: 'invoicesOverdue', defaultSize: 'sm' },
  { id: 'clockedIn', defaultSize: 'sm' },
  { id: 'earningsYear', defaultSize: 'sm' },
  { id: 'jobsActive', defaultSize: 'sm', defaultHidden: true },
  { id: 'monthlyChart', defaultSize: 'lg' },
  { id: 'upcomingJobs', defaultSize: 'lg' },
  { id: 'recentInvoices', defaultSize: 'lg' },
];

export interface DashboardLayout {
  order: string[];
  hidden: string[];
  /** Per-widget size override; missing entries fall back to defaultSize. */
  sizes?: Record<string, DashboardWidgetSize>;
}

export interface ResolvedDashboardWidget {
  id: DashboardWidgetId;
  size: DashboardWidgetSize;
}

export interface ResolvedDashboardLayout {
  /** Widgets to render, in display order, with their effective size. */
  visible: ResolvedDashboardWidget[];
  /** Widgets available in the "add widget" panel. */
  hidden: DashboardWidgetId[];
}

const byId = new Map(DASHBOARD_WIDGETS.map((w) => [w.id as string, w]));

function effectiveSize(
  def: DashboardWidgetDef,
  sizes: Record<string, DashboardWidgetSize> | undefined,
): DashboardWidgetSize {
  const saved = sizes?.[def.id];
  return saved && DASHBOARD_WIDGET_SIZES.includes(saved) ? saved : def.defaultSize;
}

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
    visible: ordered
      .filter((w) => !hiddenIds.has(w.id))
      .map((w) => ({ id: w.id, size: effectiveSize(w, layout?.sizes) })),
    hidden: ordered.filter((w) => hiddenIds.has(w.id)).map((w) => w.id),
  };
}

/** Serialize the current visible order + hidden set + sizes back into JSONB. */
export function buildDashboardLayout(
  visibleIds: string[],
  hiddenIds: string[],
  sizes: Record<string, DashboardWidgetSize>,
): DashboardLayout {
  return { order: [...visibleIds, ...hiddenIds], hidden: hiddenIds, sizes };
}

export function defaultWidgetSize(id: DashboardWidgetId): DashboardWidgetSize {
  return byId.get(id)?.defaultSize ?? 'sm';
}
