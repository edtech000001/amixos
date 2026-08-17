// Rental Properties module (migration 194) — types, storage paths, and the
// rent-ledger math shared by web and mobile.
//
// Tenants are module-OWNED records (rental_tenants), deliberately NOT linked
// to public.clients: tenant PII rides the 'rentals' permission alone, so a
// rentals-only custom role can work the whole module with zero Clientes
// access, and renters never mix into the service-business client list.
//
// The ledger has no server scheduler behind it. Charges are materialized
// LAZILY: on module load, generateChargesForLeases (rentalsQuery.ts) upserts
// one row per lease-month up to the current month, anchored on the DB's
// unique (lease_id, period_start) so concurrent devices race harmlessly.
// Charge amounts are snapshots — editing a lease's rent only affects months
// not yet materialized.

import { PRIVATE_ASSETS_BUCKET } from './storageUrls';

// ─── Row types ───────────────────────────────────────────────────────────────

export type PropertyType = 'house' | 'duplex' | 'apartment' | 'commercial' | 'land' | 'other';
export const PROPERTY_TYPES: PropertyType[] = ['house', 'duplex', 'apartment', 'commercial', 'land', 'other'];

export interface RentalProperty {
  id: string;
  business_id: string;
  location_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: PropertyType | null;
  unit_count: number | null;      // null = single-unit
  purchase_date: string | null;   // ISO date
  purchase_price: number | null;
  notes: string | null;
  status: 'active' | 'inactive';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalPropertyPhoto {
  id: string;
  business_id: string;
  property_id: string;
  storage_path: string;
  rotation: number;               // display-only 0/90/180/270
  is_cover: boolean;              // list-card cover pick (202); falls back to oldest
  lease_id: string | null;        // damage-doc category: tenant stay (203)
  phase: 'before' | 'after' | null;
  created_by: string | null;
  created_at: string;
}

export interface RentalTenant {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  /** Relationship to the tenant ("madre", "esposo"…). Migration 196. */
  emergency_contact_relation: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalLease {
  id: string;
  business_id: string;
  property_id: string;
  tenant_id: string;
  unit_label: string | null;
  start_date: string;             // ISO date
  end_date: string | null;        // null = month-to-month
  monthly_rent: number;
  due_day: number;                // 1–31, clamped to month length per charge
  deposit_amount: number | null;
  status: 'active' | 'ended';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalLeaseDocument {
  id: string;
  business_id: string;
  lease_id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RentalCharge {
  id: string;
  business_id: string;
  lease_id: string;
  property_id: string;
  period_start: string;           // canonical YYYY-MM-01
  due_date: string;
  amount: number;                 // snapshot at generation
  kind: 'rent' | 'late_fee' | 'other';
  note: string | null;
  created_at: string;
}

export interface RentalPayment {
  id: string;
  business_id: string;
  charge_id: string;
  lease_id: string;
  amount: number;
  method: string | null;
  paid_on: string;                // ISO date
  photo_path: string | null;
  photo_rotation: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type MaintenanceStatus = 'open' | 'in_progress' | 'done';

export interface RentalMaintenance {
  id: string;
  business_id: string;
  property_id: string;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  reported_on: string;            // ISO date
  completed_on: string | null;
  cost: number | null;
  fixed_by: string | null;
  employee_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalMaintenancePhoto {
  id: string;
  business_id: string;
  maintenance_id: string;
  storage_path: string;
  rotation: number;
  created_by: string | null;
  created_at: string;
}

export type ExpenseCategory =
  | 'repairs' | 'utilities' | 'property_tax' | 'insurance'
  | 'mortgage' | 'hoa' | 'management' | 'other';
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'repairs', 'utilities', 'property_tax', 'insurance', 'mortgage', 'hoa', 'management', 'other',
];

export interface RentalExpense {
  id: string;
  business_id: string;
  property_id: string;
  expense_date: string;           // ISO date
  amount: number;
  category: ExpenseCategory;
  vendor: string | null;
  note: string | null;
  receipt_path: string | null;
  receipt_rotation: number;
  maintenance_id: string | null;  // set when auto-created from a maintenance record
  created_by: string | null;
  created_at: string;
}

// ─── Storage paths ───────────────────────────────────────────────────────────
// business_id MUST be path segment 2 — the business-private policies and the
// storage-usage RPC (migration 100) both key on foldername[2].

export const RENTALS_BUCKET = PRIVATE_ASSETS_BUCKET;

/** Per-file cap for lease documents — same as job docs / Files. */
export const LEASE_DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_DOCS_PER_LEASE = 20;
export const MAX_PHOTOS_PER_PROPERTY = 12;
export const MAX_PHOTOS_PER_MAINTENANCE = 12;

export function rentalUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function rentalPropertyPhotoPath(businessId: string, propertyId: string, uid: string): string {
  return `rentals/${businessId}/properties/${propertyId}/${uid}.jpg`;
}

export function rentalMaintenancePhotoPath(businessId: string, maintenanceId: string, uid: string): string {
  return `rentals/${businessId}/maintenance/${maintenanceId}/${uid}.jpg`;
}

export function rentalLeaseDocPath(businessId: string, leaseId: string, uid: string, filename: string): string {
  return `rentals/${businessId}/leasedocs/${leaseId}/${uid}/${filename}`;
}

export function rentalPaymentPhotoPath(businessId: string, uid: string): string {
  return `rentals/${businessId}/payments/${uid}.jpg`;
}

export function rentalReceiptPath(businessId: string, uid: string): string {
  return `rentals/${businessId}/receipts/${uid}.jpg`;
}

// ─── Ledger math (pure; date-only strings handled with local-time parts) ─────

/** Half-cent float tolerance, matching invoices' syncInvoiceToPayments. */
export const PAY_TOLERANCE = 0.005;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse 'YYYY-MM-DD' as a LOCAL date (never new Date(str) — that's UTC). */
export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Day-of-month clamped to the month's real length (Jan 31 → Feb 28). */
export function clampMonthDay(year: number, monthIdx: number, day: number): Date {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return new Date(year, monthIdx, Math.min(day, lastDay));
}

export interface DuePeriod {
  periodStart: string; // YYYY-MM-01
  dueDate: string;     // YYYY-MM-DD
}

/**
 * The lease's chargeable months from its start through `today` (never future
 * months). First charge = the first month whose clamped due date falls ON or
 * AFTER start_date. A month is charged only if its due date is within the
 * lease (due date ≤ end_date). No proration in v1 — every charge is the full
 * monthly rent.
 */
export function duePeriodsForLease(
  lease: Pick<RentalLease, 'start_date' | 'end_date' | 'due_day'>,
  today: Date = new Date(),
): DuePeriod[] {
  const start = parseDateOnly(lease.start_date);
  const end = lease.end_date ? parseDateOnly(lease.end_date) : null;
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  let y = start.getFullYear();
  let m = start.getMonth();
  if (clampMonthDay(y, m, lease.due_day).getTime() < start.getTime()) {
    m += 1; // normalize via Date roll-over below
  }

  const out: DuePeriod[] = [];
  for (;;) {
    const periodStart = new Date(y, m, 1);
    if (periodStart.getTime() > currentMonthStart.getTime()) break;
    const due = clampMonthDay(periodStart.getFullYear(), periodStart.getMonth(), lease.due_day);
    if (end && due.getTime() > end.getTime()) break;
    out.push({ periodStart: ymd(periodStart), dueDate: ymd(due) });
    m += 1;
  }
  return out;
}

export type ChargeStatus = 'paid' | 'partial' | 'unpaid' | 'late';

/** Status of one charge given the total paid against it. */
export function chargeStatus(
  charge: Pick<RentalCharge, 'amount' | 'due_date'>,
  paidTotal: number,
  today: Date = new Date(),
): ChargeStatus {
  if (paidTotal >= charge.amount - PAY_TOLERANCE) return 'paid';
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (parseDateOnly(charge.due_date).getTime() < t.getTime()) return 'late';
  return paidTotal > PAY_TOLERANCE ? 'partial' : 'unpaid';
}

/** Days a charge is past due (0 when not yet due). */
export function chargeDaysLate(charge: Pick<RentalCharge, 'due_date'>, today: Date = new Date()): number {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.floor((t.getTime() - parseDateOnly(charge.due_date).getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

/** Outstanding balance across a set of charges and the payments against them. */
export function leaseBalance(
  charges: Pick<RentalCharge, 'amount'>[],
  payments: Pick<RentalPayment, 'amount'>[],
): number {
  const charged = charges.reduce((sum, c) => sum + c.amount, 0);
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  return charged - paid;
}

/**
 * Days until the lease ends (negative = already ended). Null for
 * month-to-month so callers render nothing. Mirrors plateExpirationDays.
 */
export function leaseExpirationDays(end_date: string | null): number | null {
  if (!end_date) return null;
  const end = parseDateOnly(end_date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((end.getTime() - today.getTime()) / 86400000);
}

/**
 * Occupancy across properties: occupied = distinct (property, unit_label)
 * pairs among active leases (capped per property); capacity = Σ unit_count
 * (null → 1). Inactive properties are excluded from capacity.
 */
export function occupancy(
  properties: Pick<RentalProperty, 'id' | 'unit_count' | 'status'>[],
  activeLeases: Pick<RentalLease, 'property_id' | 'unit_label'>[],
): { occupied: number; capacity: number } {
  const capOf = new Map<string, number>();
  let capacity = 0;
  for (const p of properties) {
    if (p.status !== 'active') continue;
    const cap = Math.max(1, p.unit_count ?? 1);
    capOf.set(p.id, cap);
    capacity += cap;
  }
  const unitsByProp = new Map<string, Set<string>>();
  for (const l of activeLeases) {
    if (!capOf.has(l.property_id)) continue;
    const set = unitsByProp.get(l.property_id) ?? new Set<string>();
    set.add((l.unit_label ?? '').trim().toLowerCase());
    unitsByProp.set(l.property_id, set);
  }
  let occupied = 0;
  unitsByProp.forEach((units, propId) => {
    occupied += Math.min(units.size, capOf.get(propId) ?? 1);
  });
  return { occupied, capacity };
}

/** "Nombre Apellido" for a tenant row. */
export function tenantName(t: Pick<RentalTenant, 'first_name' | 'last_name'>): string {
  return [t.first_name, t.last_name].filter(Boolean).join(' ');
}
