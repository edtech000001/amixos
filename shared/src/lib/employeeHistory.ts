// Append-only milestone log for employees. Powers the "Historial" timeline
// in the employee edit view — pay raises, role changes, terminations, etc.

import type { SupabaseClient } from '@supabase/supabase-js';

export type EmployeeEventType =
  | 'hired'
  | 'pay_change'
  | 'role_change'
  | 'terminated'
  | 'rehired'
  | 'note';

export interface EmployeeHistoryEntry {
  id: string;
  business_id: string;
  employee_id: string;
  event_type: EmployeeEventType;
  details: Record<string, unknown>;
  effective_date: string;
  created_by: string | null;
  created_at: string;
}

interface LogArgs {
  businessId: string;
  employeeId: string;
  eventType: EmployeeEventType;
  details?: Record<string, unknown>;
  effectiveDate?: string;
  createdBy?: string | null;
}

/**
 * Append a milestone. Fire-and-forget — if the insert fails (RLS, network,
 * whatever) we don't want to block the save flow, so callers should not
 * await this in a try/catch they care about.
 */
export async function logEmployeeMilestone(
  supabase: SupabaseClient,
  { businessId, employeeId, eventType, details = {}, effectiveDate, createdBy }: LogArgs,
): Promise<void> {
  await supabase.from('employee_history').insert({
    business_id: businessId,
    employee_id: employeeId,
    event_type: eventType,
    details,
    effective_date: effectiveDate ?? new Date().toISOString().split('T')[0],
    created_by: createdBy ?? null,
  });
}

/**
 * Diff old vs new employee values and return the milestone entries that
 * should be logged. Returns an empty array when nothing material changed —
 * phone / name / minor edits don't generate history.
 */
export function diffEmployeeChanges(
  prev: { pay_rate: number; pay_type: string; role: string },
  next: { pay_rate: number; pay_type: string; role: string },
): { eventType: EmployeeEventType; details: Record<string, unknown> }[] {
  const out: { eventType: EmployeeEventType; details: Record<string, unknown> }[] = [];

  if (prev.pay_rate !== next.pay_rate || prev.pay_type !== next.pay_type) {
    out.push({
      eventType: 'pay_change',
      details: {
        from_rate: prev.pay_rate,
        to_rate: next.pay_rate,
        from_type: prev.pay_type,
        to_type: next.pay_type,
      },
    });
  }

  if (prev.role !== next.role) {
    out.push({
      eventType: 'role_change',
      details: { from: prev.role, to: next.role },
    });
  }

  return out;
}
