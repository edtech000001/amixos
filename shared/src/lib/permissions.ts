// Single source of truth for what each role can do. Both web and mobile
// import from here so a gate can never drift between platforms.
//
// Permissions are modeled as DATA — a resource×action grid plus a set of
// system capabilities — per role (see RolePermissions). DEFAULT_ROLE_PERMISSIONS
// holds the built-in defaults; a business can later override these (role editor,
// stored in DB) and `can.*` will read the loaded matrix instead. For now the
// `can.*` helpers read the defaults, preserving today's behavior exactly.
//
// Server-side enforcement lives in RLS policies (migration 022+). This file is
// the client-side mirror: hide buttons, filter lists, swap in read-only UI.
// Never rely on it for security — RLS is the lock; this just keeps the UI
// from offering things the lock will reject.

export type Role = 'owner' | 'admin' | 'manager' | 'office' | 'field' | 'viewer';

// Custom roles (migration 179): a business can define extra roles beyond the
// built-ins. Their key is an arbitrary slug stored in business_roles
// (is_system=false) and flows through the app typed as `Role` — every resolver
// here treats unknown keys as deny-all until the business's snapshot loads.

export const ROLE_LABELS: Record<Role, { es: string; en: string }> = {
  owner:   { es: 'Propietario',  en: 'Owner' },
  admin:   { es: 'Administrador', en: 'Admin' },
  manager: { es: 'Gerente',      en: 'Manager' },
  office:  { es: 'Oficina',      en: 'Office' },
  field:   { es: 'Campo',        en: 'Field' },
  viewer:  { es: 'Lector',       en: 'Viewer' },
};

export const ROLE_DESCRIPTIONS: Record<Role, { es: string; en: string }> = {
  owner:   { es: 'Control total, facturación, eliminar negocio.',                  en: 'Full control, billing, delete business.' },
  admin:   { es: 'Todo excepto facturación y eliminar el negocio.',                 en: 'Everything except billing and deleting the business.' },
  manager: { es: 'Clientes, trabajos, facturas, empleados. Sin ajustes.',           en: 'Clients, jobs, invoices, employees. No settings.' },
  office:  { es: 'Clientes, trabajos, facturas, calendario. Sin empleados.',        en: 'Clients, jobs, invoices, calendar. No employee data.' },
  field:   { es: 'Solo los trabajos asignados. Marcar hora, actualizar estado.',    en: 'Only assigned jobs. Clock in/out, update status.' },
  viewer:  { es: 'Solo lectura. Para contadores y socios.',                          en: 'Read-only. For accountants and partners.' },
};

// ─── Permission catalog (the editable grid) ────────────────────────────────
// Resources are the rows of the role editor; each has up to four actions.
// `view` is a 3-state scope so field-style roles can be limited to records
// they're assigned to (jobs, clients) rather than the whole table.

export type ViewScope = 'none' | 'assigned' | 'all';

export type ResourceKey =
  | 'jobs'
  | 'clients'
  | 'invoices'
  | 'employees'
  | 'calendar'
  | 'inventory'
  | 'equipment'
  | 'rentals'
  | 'reports';

export interface ResourcePerm {
  view: ViewScope;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

// Which actions/columns each resource actually supports — drives the editor
// grid (unsupported cells render greyed) and documents where 'assigned' view
// is meaningful. Calendar/inventory are view+edit only; reports is view-only.
export const RESOURCE_ACTIONS: Record<
  ResourceKey,
  { create: boolean; edit: boolean; delete: boolean; assignedView: boolean }
> = {
  jobs:      { create: true,  edit: true,  delete: true,  assignedView: true },
  clients:   { create: true,  edit: true,  delete: true,  assignedView: true },
  invoices:  { create: true,  edit: true,  delete: true,  assignedView: false },
  employees: { create: true,  edit: true,  delete: true,  assignedView: false },
  calendar:  { create: true,  edit: true,  delete: true,  assignedView: false },
  inventory: { create: true,  edit: true,  delete: true,  assignedView: false },
  equipment: { create: true,  edit: true,  delete: true,  assignedView: false },
  rentals:   { create: true,  edit: true,  delete: true,  assignedView: false },
  reports:   { create: false, edit: false, delete: false, assignedView: false },
};

export const RESOURCE_KEYS = Object.keys(RESOURCE_ACTIONS) as ResourceKey[];

// System capabilities that aren't resource×CRUD. Most are owner/admin-level or
// derived; the editor surfaces a curated subset (e.g. "Manage settings"),
// while the rest stay governed by sensible defaults.
export type CapabilityKey =
  | 'manageSettings'        // Ajustes config: fields, pipeline, templates
  | 'manageMembers'         // invite / manage team + roles
  | 'manageBilling'         // owner only
  | 'deleteBusiness'        // owner only
  | 'viewAuditLog'
  | 'viewAllTimesheets'     // see everyone's timesheets (vs own)
  | 'writeOwnTimesheet'     // clock in/out
  | 'delegateJob'           // cross-business job delegation
  | 'logCompletedJob'       // field quick-log of a completed job
  | 'assignWorkers'         // assign crew to jobs
  | 'manageFiles'           // document library categories/uploads
  | 'manageIntegrations'    // SMS/Google creds, etc.
  | 'manageAssignmentFields' // per-worker assignment field templates
  | 'createEstimates'       // create estimates/proposals (vs plain work orders)
  | 'clockInOut'            // show the clock in/out card on the field home
  | 'scheduleJobs'          // field crew may schedule/change job status (vs
                            // completed-only: record finished work, no scheduling)
  | 'switchLocations'       // multi-location: may switch/view other branches
                            // (false = locked to their own home branch across
                            // the whole app; enforced in UI + RLS)
  | 'completedByDefault';   // NEW jobs this role creates start as "completed"
                            // instead of "scheduled" (crews that log finished
                            // work). Default only — status stays editable.

export interface RolePermissions {
  resources: Record<ResourceKey, ResourcePerm>;
  caps: Record<CapabilityKey, boolean>;
}

// Small builders to keep the matrix readable.
const R = (view: ViewScope, create = false, edit = false, del = false): ResourcePerm => ({
  view, create, edit, delete: del,
});
const caps = (overrides: Partial<Record<CapabilityKey, boolean>>): Record<CapabilityKey, boolean> => ({
  manageSettings: false, manageMembers: false, manageBilling: false, deleteBusiness: false,
  viewAuditLog: false, viewAllTimesheets: false, writeOwnTimesheet: false, delegateJob: false,
  logCompletedJob: false, assignWorkers: false, manageFiles: false, manageIntegrations: false,
  manageAssignmentFields: false, createEstimates: false, clockInOut: false,
  scheduleJobs: false, switchLocations: false, completedByDefault: false,
  ...overrides,
});

const ALL_RESOURCES = (view: ViewScope, c: boolean, e: boolean, d: boolean): Record<ResourceKey, ResourcePerm> => ({
  jobs: R(view, c, e, d), clients: R(view, c, e, d), invoices: R(view, c, e, d),
  employees: R(view, c, e, d), calendar: R(view, c, e, d), inventory: R(view, c, e, d),
  equipment: R(view, c, e, d), rentals: R(view, c, e, d), reports: R(view, c, e, d),
});

// ─── Default permissions per role ──────────────────────────────────────────
// These reproduce the previous hardcoded behavior exactly; the role editor
// will later let a business override them (persisted in DB).

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  owner: {
    resources: ALL_RESOURCES('all', true, true, true),
    caps: caps({
      manageSettings: true, manageMembers: true, manageBilling: true, deleteBusiness: true,
      viewAuditLog: true, viewAllTimesheets: true, writeOwnTimesheet: true, delegateJob: true,
      logCompletedJob: true, assignWorkers: true, manageFiles: true, manageIntegrations: true,
      manageAssignmentFields: true, createEstimates: true, switchLocations: true,
    }),
  },
  admin: {
    resources: ALL_RESOURCES('all', true, true, true),
    caps: caps({
      manageSettings: true, manageMembers: true, manageBilling: false, deleteBusiness: false,
      viewAuditLog: true, viewAllTimesheets: true, writeOwnTimesheet: true, delegateJob: true,
      logCompletedJob: true, assignWorkers: true, manageFiles: true, manageIntegrations: true,
      manageAssignmentFields: true, createEstimates: true, switchLocations: true,
    }),
  },
  manager: {
    resources: {
      jobs: R('all', true, true, false),
      clients: R('all', true, true, false),
      invoices: R('all', true, true, false),
      employees: R('all', true, true, false),
      calendar: R('all', true, true, true),
      inventory: R('all', true, true, true),
      equipment: R('all', true, true, true),
      rentals: R('all', true, true, true),
      reports: R('all'),
    },
    caps: caps({
      viewAllTimesheets: true, writeOwnTimesheet: true, assignWorkers: true,
      manageFiles: true, manageIntegrations: true, createEstimates: true, switchLocations: true,
    }),
  },
  office: {
    resources: {
      jobs: R('all', true, true, false),
      clients: R('all', true, true, false),
      invoices: R('all', true, true, false),
      employees: R('none'),
      calendar: R('all', true, true, true),
      inventory: R('all', true, true, true),
      equipment: R('all', true, true, true),
      rentals: R('all', true, true, true),
      reports: R('none'),
    },
    caps: caps({
      writeOwnTimesheet: true, manageFiles: true, manageIntegrations: true, createEstimates: true,
      switchLocations: true,
    }),
  },
  field: {
    resources: {
      // Field crew create + edit their (assigned) jobs by default; delete is
      // OFF — the RLS side (089 default_role_permissions) never allowed field
      // deletes, so offering the button only produced a dead action. Estimates
      // stay OFF by default (createEstimates) so a business opts in per-role
      // from the role editor.
      jobs: R('assigned', true, true, false),
      clients: R('assigned', false, false, false),
      invoices: R('none'),
      employees: R('none'),
      calendar: R('none'),
      inventory: R('none'),
      equipment: R('none'),
      rentals: R('none'),
      reports: R('none'),
    },
    // Clock in/out on by default for crew (the only role with the card); a
    // business that doesn't track shifts can turn it off in the role editor.
    caps: caps({ writeOwnTimesheet: true, logCompletedJob: true, clockInOut: true }),
  },
  viewer: {
    resources: {
      jobs: R('all', false, false, false),
      clients: R('all', false, false, false),
      invoices: R('all', false, false, false),
      employees: R('all', false, false, false),
      calendar: R('all', false, false, false),
      inventory: R('all', false, false, false),
      equipment: R('all', false, false, false),
      rentals: R('all', false, false, false),
      reports: R('all'),
    },
    caps: caps({ viewAllTimesheets: true, switchLocations: true }),
  },
};

/** The permission set for a role (built-in defaults, ignoring overrides). */
export function permissionsForRole(role: Role | null | undefined): RolePermissions | null {
  return role ? DEFAULT_ROLE_PERMISSIONS[role] : null;
}

// ─── Active per-business overrides ─────────────────────────────────────────
// AppContext loads the active business's customized roles (business_roles
// table) and registers them here. `can.*` then resolves against the override
// for a role when present, else the built-in default — so every existing
// can.X(role) call site becomes override-aware with no change. Module-level
// because there is exactly one active business per client session; cleared on
// logout / business switch. Null overrides = pure defaults (today's behavior).
let activeOverrides: Partial<Record<Role, RolePermissions>> | null = null;

/** Register the active business's customized role permissions (or null). */
export function setActiveRolePermissions(map: Partial<Record<Role, RolePermissions>> | null): void {
  activeOverrides = map;
}

/** The effective permissions for a role: the active override, else default.
 *  Custom roles have no built-in default — before their snapshot loads they
 *  resolve to null, i.e. deny-all (mirrors the SQL resolvers' fail-closed). */
export function effectivePermissions(role: Role | null | undefined): RolePermissions | null {
  if (!role) return null;
  return activeOverrides?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? null;
}

// ─── Custom-role registry ──────────────────────────────────────────────────
// Loaded alongside the permission overrides (business_roles rows with
// is_system=false). Gives the UI display names + the list of extra role keys
// for pickers. Cleared on logout / business switch, like the overrides.

export interface CustomRoleMeta { key: string; name: string }

let activeCustomRoles: CustomRoleMeta[] = [];

export function setActiveCustomRoles(list: CustomRoleMeta[] | null): void {
  activeCustomRoles = list ?? [];
}

export function getActiveCustomRoles(): CustomRoleMeta[] {
  return activeCustomRoles;
}

/** True for business-defined roles (not one of the 6 built-ins). */
export function isCustomRole(role: string | null | undefined): boolean {
  return !!role && !(role in DEFAULT_ROLE_PERMISSIONS);
}

/** Display name for any role key: built-in label, else the custom role's
 *  stored name, else the raw key (e.g. before the registry loads). */
export function roleLabel(role: string | null | undefined, locale: 'es' | 'en'): string {
  if (!role) return '';
  const sys = ROLE_LABELS[role as Role];
  if (sys) return sys[locale];
  return activeCustomRoles.find((r) => r.key === role)?.name ?? role;
}

/** Description for a role key; custom roles have none (return ''). */
export function roleDescription(role: string | null | undefined, locale: 'es' | 'en'): string {
  if (!role) return '';
  return ROLE_DESCRIPTIONS[role as Role]?.[locale] ?? '';
}

/**
 * Merge a stored permissions snapshot (business_roles.permissions JSONB) over
 * the role's built-in defaults. Tolerant of missing/partial keys so an older
 * snapshot, or one written before a new resource/capability existed, still
 * resolves to a complete RolePermissions.
 */
export function mergeRolePermissions(role: Role, raw: unknown): RolePermissions {
  // Custom roles have no built-in default — merge over deny-all so a key
  // missing from the snapshot means NO access (matches the SQL resolvers).
  const base = DEFAULT_ROLE_PERMISSIONS[role]
    ?? { resources: ALL_RESOURCES('none', false, false, false), caps: caps({}) };
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as { resources?: Record<string, Partial<ResourcePerm>>; caps?: Record<string, unknown> };

  const resources = { ...base.resources };
  if (r.resources && typeof r.resources === 'object') {
    for (const k of RESOURCE_KEYS) {
      const rp = r.resources[k];
      if (rp && typeof rp === 'object') {
        resources[k] = {
          view: rp.view ?? base.resources[k].view,
          create: typeof rp.create === 'boolean' ? rp.create : base.resources[k].create,
          edit: typeof rp.edit === 'boolean' ? rp.edit : base.resources[k].edit,
          delete: typeof rp.delete === 'boolean' ? rp.delete : base.resources[k].delete,
        };
      }
    }
  }

  const mergedCaps = { ...base.caps };
  if (r.caps && typeof r.caps === 'object') {
    for (const key of Object.keys(base.caps) as CapabilityKey[]) {
      const v = r.caps[key];
      if (typeof v === 'boolean') mergedCaps[key] = v;
    }
  }
  return { resources, caps: mergedCaps };
}

// ─── Top-level capability checks ──────────────────────────────────────────
// Thin readers over the matrix. Signature unchanged from before, so callers
// don't need to change; later these can accept a loaded RolePermissions.

const res = (role: Role | null, key: ResourceKey): ResourcePerm | null =>
  effectivePermissions(role)?.resources[key] ?? null;
const cap = (role: Role | null, key: CapabilityKey): boolean =>
  effectivePermissions(role)?.caps[key] ?? false;

export const can = {
  // Business settings, member management, billing, delete.
  manageBusinessSettings: (role: Role | null) => cap(role, 'manageSettings'),
  manageMembers:          (role: Role | null) => cap(role, 'manageMembers'),
  manageBilling:          (role: Role | null) => cap(role, 'manageBilling'),
  deleteBusiness:         (role: Role | null) => cap(role, 'deleteBusiness'),

  // Cross-business job delegation — only owner/admin.
  delegateJob: (role: Role | null) => cap(role, 'delegateJob'),

  // Clients
  createClient: (role: Role | null) => !!res(role, 'clients')?.create,
  editClient:   (role: Role | null) => !!res(role, 'clients')?.edit,
  deleteClient: (role: Role | null) => !!res(role, 'clients')?.delete,
  // Field workers see clients only via assigned jobs (handled in RLS + list filters).
  seeAllClients: (role: Role | null) => res(role, 'clients')?.view === 'all',

  // Jobs
  createJob:        (role: Role | null) => !!res(role, 'jobs')?.create,
  editJobMetadata:  (role: Role | null) => !!res(role, 'jobs')?.edit,
  // Status change: writers always; field worker if assigned (checked separately).
  changeJobStatus:  (role: Role | null) => !!res(role, 'jobs')?.edit,
  changeJobStatusIfAssigned: (role: Role | null) =>
    role === 'field' || (isCustomRole(role) && res(role, 'jobs')?.view === 'assigned'),
  deleteJob:        (role: Role | null) => !!res(role, 'jobs')?.delete,
  // Field workers see only their assigned jobs.
  seeAllJobs:       (role: Role | null) => res(role, 'jobs')?.view === 'all',
  // Schedule / change job status. Roles that see all jobs always can; field
  // crew only if granted the scheduleJobs cap — otherwise they may only RECORD
  // completed work (jobs they create are forced to "completed").
  scheduleJobs:     (role: Role | null) => res(role, 'jobs')?.view === 'all' || cap(role, 'scheduleJobs'),
  // Role-editor toggle: NEW jobs default to "completed" for this role.
  completedByDefault: (role: Role | null) => cap(role, 'completedByDefault'),
  // Internal job notes are office-side: any role limited to ASSIGNED jobs
  // (field, worker-style customs) neither writes nor READS them.
  seeInternalJobNotes: (role: Role | null) => res(role, 'jobs')?.view === 'all',
  // Estimates/proposals: requires job-create AND the createEstimates capability
  // (a per-role toggle so a business can let a role make work orders but not
  // estimates — e.g. field crew by default).
  createEstimate:   (role: Role | null) => !!res(role, 'jobs')?.create && cap(role, 'createEstimates'),

  // Invoices — field workers fully excluded.
  seeInvoices:    (role: Role | null) => res(role, 'invoices')?.view === 'all',
  createInvoice:  (role: Role | null) => !!res(role, 'invoices')?.create,
  editInvoice:    (role: Role | null) => !!res(role, 'invoices')?.edit,
  deleteInvoice:  (role: Role | null) => !!res(role, 'invoices')?.delete,
  // Whether financial totals (revenue widgets, line item prices) are visible.
  seeFinancials:  (role: Role | null) => res(role, 'invoices')?.view === 'all',

  // Employees — managers+ only; office staff don't see coworker pay info.
  seeEmployees:   (role: Role | null) => res(role, 'employees')?.view === 'all',
  createEmployee: (role: Role | null) => !!res(role, 'employees')?.create,
  editEmployee:   (role: Role | null) => !!res(role, 'employees')?.edit,
  deleteEmployee: (role: Role | null) => !!res(role, 'employees')?.delete,

  // Assignments — assigning workers to jobs is a manager+ act.
  assignWorkers: (role: Role | null) => cap(role, 'assignWorkers'),
  // Per-worker custom-field templates for assignments (Ajustes → Trabajos).
  manageAssignmentFields: (role: Role | null) => cap(role, 'manageAssignmentFields'),
  // Logging actuals (hours, custom fields) on a job_assignment row. UI gate
  // only — RLS enforces that field workers can only update rows on the job
  // they lead, while writers can update any.
  logJobActuals: (role: Role | null) => !!res(role, 'jobs')?.edit || cap(role, 'logCompletedJob'),

  // Timesheets — field workers can write their own; managers+ see all.
  seeAllTimesheets:    (role: Role | null) => cap(role, 'viewAllTimesheets'),
  writeOwnTimesheet:   (role: Role | null) => cap(role, 'writeOwnTimesheet'),
  // Clock in/out card on the field home. On by default for the field role; a
  // business that doesn't track shifts can turn it off in the role editor.
  clockInOut:          (role: Role | null) => cap(role, 'clockInOut'),

  // Inventory + calendar — same baseline as clients.
  editInventory: (role: Role | null) => !!res(role, 'inventory')?.edit,
  editCalendar:  (role: Role | null) => !!res(role, 'calendar')?.edit,

  // Equipment — its own resource (only meaningful when the equipment module is
  // active; the role editor hides the toggle otherwise). Field default = none.
  viewEquipment: (role: Role | null) => res(role, 'equipment')?.view === 'all',
  editEquipment: (role: Role | null) => !!res(role, 'equipment')?.edit,

  // Rentals — its own resource (only meaningful when the rentals module is
  // active). Gates tenant PII too: a rentals-only custom role works the whole
  // module without any Clientes access. Field default = none.
  viewRentals:   (role: Role | null) => res(role, 'rentals')?.view === 'all',
  createRentals: (role: Role | null) => !!res(role, 'rentals')?.create,
  editRentals:   (role: Role | null) => !!res(role, 'rentals')?.edit,
  deleteRentals: (role: Role | null) => !!res(role, 'rentals')?.delete,

  // Files / document library — everyone reads (RLS + crew_visible decide what
  // a field crew actually sees); writers manage categories/sections/uploads.
  manageFiles: (role: Role | null) => cap(role, 'manageFiles'),

  // Third-party integrations (SMS provider creds, etc.). Writers configure;
  // mirrors the WRITER_ROLES gate the API enforces server-side.
  manageIntegrations: (role: Role | null) => cap(role, 'manageIntegrations'),

  // Reports
  seeReports: (role: Role | null) => res(role, 'reports')?.view === 'all',

  // Audit log viewer
  seeAuditLog: (role: Role | null) => cap(role, 'viewAuditLog'),

  // Multi-location: may switch to / view other branches. False = locked to the
  // user's own home branch across the whole app (also enforced by RLS). Owners
  // are never locked. Gates the LocationSwitcher.
  switchLocations: (role: Role | null) => role === 'owner' || cap(role, 'switchLocations'),
};

// ─── Special-case helpers ────────────────────────────────────────────────

// True if the role is "field-like" (only-assigned-jobs view): the built-in
// field role, or a custom role whose jobs view is 'assigned'. Routes to the
// field home screen instead of the owner dashboard.
export function isFieldOnly(role: Role | null | undefined): boolean {
  if (role === 'field') return true;
  return isCustomRole(role) && effectivePermissions(role as Role)?.resources.jobs.view === 'assigned';
}

// True if the role can ONLY read (cannot write to anything). Used to render
// read-only UI globally.
export function isReadOnly(role: Role | null | undefined): boolean {
  return role === 'viewer';
}

// Roles that can be assigned via the invite flow. Owner is excluded — there
// is exactly one owner per business (the creator), and ownership transfer is
// a separate flow we don't support yet.
export const INVITABLE_ROLES: Role[] = ['admin', 'manager', 'office', 'field', 'viewer'];
