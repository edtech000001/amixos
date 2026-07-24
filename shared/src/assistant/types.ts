// Wire types for the "Ami" in-app AI assistant. Shared by the api service
// (which produces drafts) and both frontends (which render them).

/** One chat turn on the wire. Text-only — tool_use blocks never round-trip;
 *  the server replays this transcript into the model on every request. */
export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A worker on a job draft. employee_id present = registered employee;
 *  absent = manual (unregistered) worker, name only. */
export interface DraftCrewMember {
  employee_id?: string;
  worker_name: string;
  is_lead?: boolean;
}

/**
 * A job the assistant PROPOSES. Nothing is written until the user presses
 * Confirmar and the client POSTs this exact object to /assistant/confirm.
 * job_id is minted at propose time and used as the insert PK → retried
 * confirms are idempotent.
 */
export interface JobDraft {
  /** Discriminant for the draft union — absent/'create' = a new job. */
  kind?: 'create';
  job_id: string;
  business_id: string;
  title: string;
  description?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduled_date?: string; // YYYY-MM-DD
  end_date?: string;
  all_day: boolean;
  time_start?: string;
  time_end?: string;
  total_hours?: number;
  client_id?: string;
  client_name?: string;
  /** false = the model couldn't match client_name to a client row; the
   *  preview shows an amber "sin coincidencia" badge. */
  client_resolved: boolean;
  crew: DraftCrewMember[];
  driver_employee_ids: string[];
  driver_hours?: number;
  /** Values for job_field_templates, keyed by field_key, stored as strings
   *  (multi-select comma-joined) — same contract as the job form. */
  custom_fields: Record<string, string>;
  internal_notes?: string;
  worker_notes?: string;
  /** Spanish, human-readable caveats (e.g. unresolved client). */
  warnings: string[];
}

/**
 * A change to an EXISTING job the assistant proposes (reschedule / retime /
 * re-crew). Nothing is written until the user presses Confirmar. Only the
 * fields being changed are set; `before` snapshots the current values so the
 * card can show old → new.
 */
export interface JobUpdateDraft {
  kind: 'update';
  job_id: string;
  business_id: string;
  title: string;
  scheduled_date?: string; // YYYY-MM-DD
  end_date?: string | null;
  all_day?: boolean;
  time_start?: string | null; // HH:MM
  time_end?: string | null;
  /** Present = replace the job's crew with this list. */
  crew?: DraftCrewMember[];
  /** Current values, for the before → after display. */
  before: {
    scheduled_date?: string | null;
    end_date?: string | null;
    all_day?: boolean;
    time_start?: string | null;
    time_end?: string | null;
    crew?: string[];
  };
  warnings: string[];
}

/** Either draft the assistant can propose; discriminated by `kind`. */
export type AssistantDraft = JobDraft | JobUpdateDraft;

/** True when a draft targets an existing job (reschedule/edit). */
export function isJobUpdateDraft(d: AssistantDraft | null | undefined): d is JobUpdateDraft {
  return !!d && (d as JobUpdateDraft).kind === 'update';
}

export interface AssistantChatRequest {
  business_id: string;
  messages: AssistantChatMessage[];
  pending_draft?: AssistantDraft | null;
}

export interface AssistantChatResponse {
  reply: string;
  pending_draft?: AssistantDraft | null;
}

export interface AssistantConfirmResponse {
  job_id: string;
  already_existed: boolean;
}
