// Assistant wire types. KEEP IN SYNC with shared/src/assistant/types.ts —
// the api workspace doesn't depend on @amixos/shared (rootDir is scoped to
// ./src), so like weather.ts/supabaseFetch.ts this is a synced copy.

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
  /** RLS-scoped supabase client (anon key + caller JWT). */
  db: import('@supabase/supabase-js').SupabaseClient;
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
