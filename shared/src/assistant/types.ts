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
  /** New pipeline status (work phase only). */
  status?: JobUpdateStatus;
  /** true = archive, false = unarchive. */
  archived?: boolean;
  details?: JobDetailChanges;
  /** Price-line changes (job_items); `items_hash` guards the indexes. */
  item_ops?: JobItemOp[];
  items_hash?: string;
  /** Display rows for `details`, already in the user's language. */
  detail_rows?: { label: string; from: string; to: string }[];
  /** Current values, for the before → after display. */
  before: {
    scheduled_date?: string | null;
    end_date?: string | null;
    all_day?: boolean;
    time_start?: string | null;
    time_end?: string | null;
    crew?: string[];
    status?: string;
    archived?: boolean;
  };
  warnings: string[];
}

/** Edits to the job's own fields (rename, notes, client, address, custom
 *  fields…). Only changed keys are present; null / '' clears. */
export interface JobDetailChanges {
  title?: string;
  description?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  client_id?: string | null;
  total_hours?: number | null;
  internal_notes?: string | null;
  worker_notes?: string | null;
  job_address?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  /** Merged into the job's existing custom_fields. */
  custom_fields?: Record<string, string>;
}

/** Either draft the assistant can propose; discriminated by `kind`. */
/** Statuses Ami may move an existing job to (invoicing goes through Facturas). */
export type JobUpdateStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** One change to an unsent invoice's lines. Indexes refer to line_items as
 *  Ami read them (snapshot_hash guards that they haven't moved since). */
export type InvoiceLineOp =
  | { op: 'update'; index: number; description?: string; qty?: number; rate?: number }
  | { op: 'exclude'; index: number; excluded: boolean }
  | { op: 'remove'; index: number }
  | { op: 'add'; description: string; qty: number; rate: number }
  /** Move a line to another unsent invoice of the same client. A job's line
   *  moves with all of that job's lines (they bill together). */
  | { op: 'move'; index: number; to_invoice_id: string }
  /** Switch price-sheet add-ons (ids) on/off for one line — applied with the
   *  same lineAddons helpers as Edit item, so the price is re-derived there. */
  | { op: 'addons'; index: number; on: string[]; off: string[] }
  /** Bill the invoice to another client; its jobs move to that client too. */
  | { op: 'client'; client_id: string };

/** A change to an unsent invoice. Applied by the APP (shared invoicing
 *  helpers, same code as the invoice screen), not the API. */
export interface InvoiceEditDraft {
  kind: 'invoice_edit';
  /** Draft key used for bubble matching — the invoice id. */
  job_id: string;
  invoice_id: string;
  business_id: string;
  title: string;
  /** lineItemsHash() of the lines Ami read; applying refuses if they changed. */
  snapshot_hash: string;
  ops: InvoiceLineOp[];
  detail_rows: { label: string; from: string; to: string }[];
  warnings: string[];
}

/** Change to a job's price lines (job_items, ordered by created_at). */
export type JobItemOp =
  | { op: 'update'; index: number; description?: string; quantity?: number; unit_price?: number }
  | { op: 'remove'; index: number }
  | { op: 'add'; description: string; quantity: number; unit_price: number };

/** Cheap fingerprint of an invoice's line_items (djb2 over the JSON). KEEP IN
 *  SYNC between api/ and shared/ — both sides must hash identically. */
export function lineItemsHash(lines: unknown): string {
  const s = JSON.stringify(lines ?? []);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

export const PAY_METHOD_KEYS = ['check', 'cash', 'card', 'transfer', 'zelle', 'cashapp', 'venmo', 'paypal', 'moneyOrder', 'other'] as const;
export type PayMethodKey = (typeof PAY_METHOD_KEYS)[number];

/** Things Ami prepares that the APP carries out with the same shared helpers
 *  as its own screens (invoice from jobs, payments, quick quotes, client log,
 *  new client). The API only validates + drafts them. */
export type ActionDraft = {
  kind: 'action';
  /** Draft key for bubble matching (random). */
  job_id: string;
  business_id: string;
  title: string;
  detail_rows: { label: string; from: string; to: string }[];
  warnings: string[];
} & (
  | { action: 'invoice_jobs'; params: { job_ids: string[]; to_invoice_id?: string } }
  | { action: 'payment'; params: { invoice_id: string; amount: number; method: PayMethodKey; paid_on: string } }
  | { action: 'quick_quote'; params: { client_id: string | null; title: string; price: number | null; notes: string | null } }
  | { action: 'client_note'; params: { client_id: string; type: 'call' | 'sms' | 'email' | 'in_person' | 'whatsapp' | 'note'; outcome: 'connected' | 'no_answer' | 'sent' | 'left_voicemail' | null; note: string | null } }
  | { action: 'client_create'; params: { first_name: string; last_name: string | null; company: string | null; phone_cell: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zip_code: string | null } }
);

/** Restores a job to how it was before an Ami change (returned by /confirm,
 *  replayed by /undo). */
export interface JobUndoSnapshot {
  job_id: string;
  /** Original values of every jobs column the change wrote. */
  job: Record<string, unknown>;
  items?: Record<string, unknown>[];
  crew?: Record<string, unknown>[];
  /** Set when the change CREATED the job: undo deletes it. */
  created?: boolean;
}

export type AssistantDraft = JobDraft | JobUpdateDraft | InvoiceEditDraft | ActionDraft;

/** Screens Ami can open for the user (mapped to a route per platform). */
export type AssistantScreen =
  | 'home' | 'jobs' | 'invoices' | 'clients' | 'calendar' | 'employees'
  | 'reports' | 'map' | 'settings' | 'notifications' | 'payroll'
  | 'job' | 'invoice' | 'client';

/** Something the CLIENT does after a reply: open a screen, or press
 *  Confirmar on the pending draft because the user said so by voice. */
export type AssistantClientAction =
  | { type: 'navigate'; screen: AssistantScreen; id?: string }
  | { type: 'confirm' }
  /** "Deshaz eso": the app reverses the last change it applied. */
  | { type: 'undo' };

/** True when a draft targets an existing job (reschedule/edit). */
export function isJobUpdateDraft(d: AssistantDraft | null | undefined): d is JobUpdateDraft {
  return !!d && (d as JobUpdateDraft).kind === 'update';
}

export function isInvoiceEditDraft(d: AssistantDraft | null | undefined): d is InvoiceEditDraft {
  return !!d && (d as InvoiceEditDraft).kind === 'invoice_edit';
}

export function isActionDraft(d: AssistantDraft | null | undefined): d is ActionDraft {
  return !!d && (d as ActionDraft).kind === 'action';
}

/** Shows an action in the change card, and which screen its result opens. */
export function actionAsUpdate(d: ActionDraft): JobUpdateDraft {
  return { kind: 'update', job_id: d.job_id, business_id: d.business_id, title: d.title, before: {}, detail_rows: d.detail_rows, warnings: d.warnings };
}
export function actionTarget(d: ActionDraft): 'job' | 'invoice' | 'client' {
  return d.action === 'quick_quote' ? 'job' : d.action === 'client_note' || d.action === 'client_create' ? 'client' : 'invoice';
}

/** Shows an invoice edit in the change card (title + old → new rows). */
export function invoiceEditAsUpdate(d: InvoiceEditDraft): JobUpdateDraft {
  return { kind: 'update', job_id: d.job_id, business_id: d.business_id, title: d.title, before: {}, detail_rows: d.detail_rows, warnings: d.warnings };
}

export interface AssistantChatRequest {
  business_id: string;
  messages: AssistantChatMessage[];
  pending_draft?: AssistantDraft | null;
}

export interface AssistantChatResponse {
  reply: string;
  pending_draft?: AssistantDraft | null;
  client_action?: AssistantClientAction | null;
}

export interface AssistantConfirmResponse {
  job_id: string;
  already_existed: boolean;
  /** How to reverse this change ("deshaz eso"). */
  undo?: JobUndoSnapshot;
}
