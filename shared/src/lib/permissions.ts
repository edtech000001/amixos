// Single source of truth for what each role can do. Both web and mobile
// import from here so a gate can never drift between platforms.
//
// Server-side enforcement lives in RLS policies (migration 022). This file is
// the client-side mirror: hide buttons, filter lists, swap in read-only UI.
// Never rely on it for security — RLS is the lock; this just keeps the UI
// from offering things the lock will reject.

export type Role = 'owner' | 'admin' | 'manager' | 'office' | 'field' | 'viewer';

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

const ADMINS: Role[] = ['owner', 'admin'];
const WRITERS: Role[] = ['owner', 'admin', 'manager', 'office'];
const MANAGERS: Role[] = ['owner', 'admin', 'manager'];

function isAny(role: Role | null | undefined, allowed: Role[]): boolean {
  return !!role && allowed.includes(role);
}

// ─── Top-level capability checks ──────────────────────────────────────────

export const can = {
  // Business settings, member management, billing, delete.
  manageBusinessSettings: (role: Role | null) => isAny(role, ADMINS),
  manageMembers:          (role: Role | null) => isAny(role, ADMINS),
  manageBilling:          (role: Role | null) => role === 'owner',
  deleteBusiness:         (role: Role | null) => role === 'owner',

  // Cross-business job delegation — only owner/admin.
  delegateJob: (role: Role | null) => isAny(role, ADMINS),

  // Clients
  createClient: (role: Role | null) => isAny(role, WRITERS),
  editClient:   (role: Role | null) => isAny(role, WRITERS),
  deleteClient: (role: Role | null) => isAny(role, ADMINS),
  // Field workers see clients only via assigned jobs (handled in RLS + list filters).
  seeAllClients: (role: Role | null) => isAny(role, ['owner','admin','manager','office','viewer']),

  // Jobs
  createJob:        (role: Role | null) => isAny(role, WRITERS),
  editJobMetadata:  (role: Role | null) => isAny(role, WRITERS),
  // Status change: writers always; field worker if assigned (checked separately).
  changeJobStatus:  (role: Role | null) => isAny(role, WRITERS),
  changeJobStatusIfAssigned: (role: Role | null) => role === 'field',
  deleteJob:        (role: Role | null) => isAny(role, ADMINS),
  // Field workers see only their assigned jobs.
  seeAllJobs:       (role: Role | null) => isAny(role, ['owner','admin','manager','office','viewer']),

  // Invoices — field workers fully excluded.
  seeInvoices:    (role: Role | null) => isAny(role, ['owner','admin','manager','office','viewer']),
  createInvoice:  (role: Role | null) => isAny(role, WRITERS),
  editInvoice:    (role: Role | null) => isAny(role, WRITERS),
  deleteInvoice:  (role: Role | null) => isAny(role, ADMINS),
  // Whether financial totals (revenue widgets, line item prices) are visible.
  seeFinancials:  (role: Role | null) => isAny(role, ['owner','admin','manager','office','viewer']),

  // Employees — managers+ only; office staff don't see coworker pay info.
  seeEmployees:   (role: Role | null) => isAny(role, ['owner','admin','manager','viewer']),
  createEmployee: (role: Role | null) => isAny(role, MANAGERS),
  editEmployee:   (role: Role | null) => isAny(role, MANAGERS),
  deleteEmployee: (role: Role | null) => isAny(role, ADMINS),

  // Assignments — assigning workers to jobs is a manager+ act.
  assignWorkers: (role: Role | null) => isAny(role, MANAGERS),
  // Per-worker custom-field templates for assignments (Ajustes → Trabajos).
  manageAssignmentFields: (role: Role | null) => isAny(role, ADMINS),
  // Logging actuals (hours, custom fields) on a job_assignment row. UI gate
  // only — RLS enforces that field workers can only update rows on the job
  // they lead, while writers can update any.
  logJobActuals: (role: Role | null) => isAny(role, ['owner','admin','manager','office','field']),

  // Timesheets — field workers can write their own; managers+ see all.
  seeAllTimesheets:    (role: Role | null) => isAny(role, ['owner','admin','manager','viewer']),
  writeOwnTimesheet:   (role: Role | null) => !!role && role !== 'viewer',

  // Inventory + calendar — same baseline as clients.
  editInventory: (role: Role | null) => isAny(role, WRITERS),
  editCalendar:  (role: Role | null) => isAny(role, WRITERS),

  // Reports
  seeReports: (role: Role | null) => isAny(role, ['owner','admin','manager','viewer']),

  // Audit log viewer
  seeAuditLog: (role: Role | null) => isAny(role, ADMINS),
};

// ─── Special-case helpers ────────────────────────────────────────────────

// True if the role is "field" (only-assigned-jobs view). Saves callers from
// repeating the string compare.
export function isFieldOnly(role: Role | null | undefined): boolean {
  return role === 'field';
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
