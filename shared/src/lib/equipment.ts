// Shared types + storage helpers for the Equipment module.
//
// Storage layout (in the private `business-private` bucket, migration 066):
//   equipment/<business_id>/<equipment_id>/<photo_uuid>.<ext>
// The first segment after the bucket lets the RLS policy check business
// membership without joining the equipment table on every read. Reads go
// through signed URLs (see ./storageUrls).

export interface Equipment {
  id: string;
  business_id: string;
  name: string;
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  /** Body color, free text. Migration 078. */
  color: string | null;
  vin: string | null;
  /** Universal asset ID for non-vehicle equipment. Migration 079. */
  serial_number: string | null;
  mileage: number | null;
  plate_number: string | null;
  plate_expiration: string | null;  // ISO date
  // Insurance + acquisition + location — universal asset fields. Migration 079.
  insurance_carrier: string | null;
  insurance_policy_number: string | null;
  insurance_agent: string | null;
  insurance_agent_phone: string | null;
  insurance_expiration: string | null;   // ISO date
  purchase_date: string | null;          // ISO date
  warranty_expiration: string | null;    // ISO date
  location: string | null;
  paid_off: boolean;
  loan_lender: string | null;
  /** What the asset is worth (always shown); outstanding loan balance when
   *  not paid off. Both nullable. Migration 076. */
  value: number | null;
  loan_amount: number | null;
  assigned_employee_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentPhoto {
  id: string;
  business_id: string;
  equipment_id: string;
  storage_path: string;
  sort_order: number;
  /** Display-only rotation in degrees (0/90/180/270), migration 077. */
  rotation: number;
  created_by: string | null;
  created_at: string;
}

export const EQUIPMENT_BUCKET = 'business-private';

/** Max photos kept simple for now; the UI surfaces this as a hint. */
export const MAX_PHOTOS_PER_EQUIPMENT = 12;

/**
 * Storage path for an equipment photo. The first segment after the
 * bucket name is `equipment/<business_id>/...`, which is what the RLS
 * policy in 045_equipment.sql parses to gate access.
 */
export function equipmentPhotoPath(
  businessId: string,
  equipmentId: string,
  filename: string,
): string {
  return `equipment/${businessId}/${equipmentId}/${filename}`;
}

/**
 * Days until the plate expires (negative = already expired). Returns
 * null when no expiration is set so callers can render nothing rather
 * than a "0 days" pill.
 */
export function plateExpirationDays(plate_expiration: string | null): number | null {
  if (!plate_expiration) return null;
  const exp = new Date(plate_expiration).getTime();
  if (Number.isNaN(exp)) return null;
  const now = Date.now();
  const oneDay = 86_400_000;
  return Math.floor((exp - now) / oneDay);
}
