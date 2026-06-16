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
// Role-aware by design: each widget declares which roles may see it via
// `visibleFor` (mirroring the RLS in migration 022 — see permissions.ts).
// resolveDashboardLayout(layout, role) drops widgets the role can't see from
// BOTH the visible grid and the "add widget" catalog, so a member never sees
// a tile (e.g. revenue) the database would refuse to populate. Field workers
// get a purpose-built home instead of this grid, so their visibility here is
// moot. Passing no role keeps every widget (back-compat / owner default).
//
// Every widget supports three sizes. Size changes both the footprint AND
// the content density (each renderer decides what to show per size):
//   sm — compact tile  (web: 1/3 row · mobile: half width)
//   md — wide tile     (web: 1/2 row · mobile: full width)
//   lg — full row, expanded content
// Layouts saved before sizes existed simply omit `sizes` — defaults apply.

import { can, type Role } from './permissions';

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
  /**
   * Roles allowed to see this widget. Omitted = every role. Mirrors the
   * read-side RLS so the customize catalog never offers a tile the DB would
   * leave empty (e.g. financials for office staff who can't read invoices).
   */
  visibleFor?: (role: Role | null) => boolean;
}

// Registry order doubles as the default layout order.
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  // quickActions filters its own buttons by capability; show the tile to any
  // role that can do at least one action (writers). Read-only roles see none.
  { id: 'quickActions', defaultSize: 'lg', visibleFor: (r) => can.createJob(r) || can.createInvoice(r) || can.createClient(r) || can.editCalendar(r) },
  { id: 'earningsMonth', defaultSize: 'sm', visibleFor: can.seeFinancials },
  { id: 'invoicesPending', defaultSize: 'sm', visibleFor: can.seeInvoices },
  { id: 'clientsTotal', defaultSize: 'sm', visibleFor: can.seeAllClients },
  { id: 'invoicesOverdue', defaultSize: 'sm', visibleFor: can.seeInvoices },
  // Clocked-in count reads everyone's timesheets — managers+ only.
  { id: 'clockedIn', defaultSize: 'sm', visibleFor: can.seeAllTimesheets },
  { id: 'earningsYear', defaultSize: 'sm', visibleFor: can.seeFinancials },
  { id: 'jobsActive', defaultSize: 'sm', defaultHidden: true },
  { id: 'monthlyChart', defaultSize: 'lg', visibleFor: can.seeFinancials },
  { id: 'upcomingJobs', defaultSize: 'lg' },
  { id: 'recentInvoices', defaultSize: 'lg', visibleFor: can.seeInvoices },
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
  role: Role | null = null,
): ResolvedDashboardLayout {
  const order = layout?.order?.filter((id) => byId.has(id)) ?? [];
  const hiddenIds = new Set(
    layout
      ? (layout.hidden ?? []).filter((id) => byId.has(id))
      : DASHBOARD_WIDGETS.filter((w) => w.defaultHidden).map((w) => w.id),
  );

  // Saved order first, then any registry widgets it doesn't know about yet.
  // Drop widgets this role isn't allowed to see (from both the grid and the
  // add-catalog). A null role means "unknown" (role not resolved yet / not a
  // member) — don't restrict, the dashboard route is already auth-gated.
  const ordered = [
    ...order,
    ...DASHBOARD_WIDGETS.map((w) => w.id).filter((id) => !order.includes(id)),
  ]
    .map((id) => byId.get(id)!)
    .filter((w) => role === null || !w.visibleFor || w.visibleFor(role));

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
