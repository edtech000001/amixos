// Shared types + storage helpers for the Equipment module.
//
// Storage layout (in the existing `business-assets` bucket):
//   equipment/<business_id>/<equipment_id>/<photo_uuid>.<ext>
// The first segment after the bucket lets the RLS policy in
// 045_equipment.sql check business membership without joining the
// equipment table on every read.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Equipment {
  id: string;
  business_id: string;
  name: string;
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  mileage: number | null;
  plate_number: string | null;
  plate_expiration: string | null;  // ISO date
  paid_off: boolean;
  loan_lender: string | null;
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
  created_by: string | null;
  created_at: string;
}

export const EQUIPMENT_BUCKET = 'business-assets';

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

/** Public URL for an equipment photo by its storage_path. */
export function equipmentPhotoUrl(
  supabase: SupabaseClient,
  storagePath: string,
): string {
  return supabase.storage.from(EQUIPMENT_BUCKET).getPublicUrl(storagePath).data.publicUrl;
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
