// Assistant wire types. KEEP IN SYNC with shared/src/assistant/types.ts —
// the api workspace doesn't depend on @amixos/shared (rootDir is scoped to
// ./src), so like weather.ts/supabaseFetch.ts this is a synced copy.

// Pilot gate — KEEP IN SYNC with shared/src/assistant/config.ts. Only these
// businesses may use the assistant endpoints; null = enabled for everyone.
export const ASSISTANT_ENABLED_BUSINESS_IDS: string[] | null = [
  '47c79845-eb2b-498a-8eb1-94dbac56a5ae', // Prime Solutions
  '27e313fa-fd2f-44e8-b47d-31041a16b09f', // Champion Built
];

export function isAssistantEnabled(businessId: string): boolean {
  return ASSISTANT_ENABLED_BUSINESS_IDS === null || ASSISTANT_ENABLED_BUSINESS_IDS.includes(businessId);
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DraftCrewMember {
  employee_id?: string;
  worker_name: string;
  is_lead?: boolean;
}

export interface JobDraft {
  kind?: 'create';
  job_id: string;
  business_id: string;
  title: string;
  description?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  scheduled_date?: string;
  end_date?: string;
  all_day: boolean;
  time_start?: string;
  time_end?: string;
  total_hours?: number;
  client_id?: string;
  client_name?: string;
  client_resolved: boolean;
  crew: DraftCrewMember[];
  driver_employee_ids: string[];
  driver_hours?: number;
  custom_fields: Record<string, string>;
  internal_notes?: string;
  worker_notes?: string;
  warnings: string[];
}

/** A change to an existing job (reschedule / retime / re-crew). Only changed
 *  fields are set; `before` snapshots current values for the card display. */
export interface JobUpdateDraft {
  kind: 'update';
  job_id: string;
  business_id: string;
  title: string;
  scheduled_date?: string;
  end_date?: string | null;
  all_day?: boolean;
  time_start?: string | null;
  time_end?: string | null;
  crew?: DraftCrewMember[];
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

export type AssistantDraft = JobDraft | JobUpdateDraft;

export function isJobUpdateDraft(d: AssistantDraft | null | undefined): d is JobUpdateDraft {
  return !!d && (d as JobUpdateDraft).kind === 'update';
}

/** Per-request context threaded through the tool loop. */
export interface AssistantContext {
  businessId: string;
  businessName: string;
  userId: string;
  userName: string;
  role: string;
  /** true = field-role creator without the scheduleJobs cap: drafts are
   *  forced to completed + published. */
  restrictedCreator: boolean;
  /** The caller's own employee row id (for field self-assign), if any. */
  myEmployeeId: string | null;
  /** The app's configured language — Ami defaults to it. */
  locale: 'es' | 'en';
  /** RLS-scoped supabase client (anon key + caller JWT). */
  db: import('@supabase/supabase-js').SupabaseClient;
  /** Per-business required job fields (businesses.job_field_required JSONB —
   *  Ajustes → Trabajos). Same contract the job form enforces on save. */
  jobFieldRequired: Record<string, boolean>;
  /** Per-business hidden job fields (businesses.job_field_hidden JSONB) —
   *  a hidden field is never treated as required. */
  jobFieldHidden: Record<string, boolean>;
  employees: { id: string; name: string; role: string | null }[];
  fieldTemplates: {
    field_key: string;
    field_label: string;
    field_type: string;
    field_options: string[] | null;
    field_config: { integerOnly?: boolean; multi?: boolean; thousands?: boolean } | null;
    required: boolean;
  }[];
}
