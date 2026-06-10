// Communication log for clients. Powers the "Comunicaciones" timeline on
// the client detail view and the "Último contacto" hint on the map card.
//
// Logging is "confirm outcome after": the quick actions fire tel:/sms:/
// mailto: as usual, then on returning to the app the user confirms the
// outcome and we write one row here. Manual entries (in-person, WhatsApp,
// note) are added straight from the timeline. See migration 048.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './supabaseFetch';

export type CommType = 'call' | 'sms' | 'email' | 'in_person' | 'whatsapp' | 'note';
export type CommDirection = 'outbound' | 'inbound';
export type CommOutcome = 'connected' | 'no_answer' | 'sent' | 'left_voicemail';

export interface ClientCommunicationEntry {
  id: string;
  business_id: string;
  client_id: string;
  client_contact_id: string | null;
  type: CommType;
  direction: CommDirection;
  outcome: CommOutcome | null;
  contact_method: string | null;
  note: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined contact-person name (when client_contact_id is set). PostgREST
  // returns this as a nested object under the FK relationship name.
  client_contacts?: { name: string } | null;
}

export interface LogCommunicationArgs {
  businessId: string;
  clientId: string;
  type: CommType;
  direction?: CommDirection;
  outcome?: CommOutcome | null;
  contactMethod?: string | null;
  note?: string | null;
  clientContactId?: string | null;
  occurredAt?: string;
  createdBy?: string | null;
}

/**
 * Insert one communication row and return it (so callers can optimistically
 * prepend it to the timeline). Quick-action callers that only care about the
 * "last contacted" refresh can ignore the result. Returns null on failure
 * rather than throwing — a logging failure should never block the user.
 */
export async function logClientCommunication(
  supabase: SupabaseClient,
  args: LogCommunicationArgs,
): Promise<ClientCommunicationEntry | null> {
  const { data, error } = await supabase
    .from('client_communications')
    .insert({
      business_id: args.businessId,
      client_id: args.clientId,
      client_contact_id: args.clientContactId ?? null,
      type: args.type,
      direction: args.direction ?? 'outbound',
      outcome: args.outcome ?? null,
      contact_method: args.contactMethod ?? null,
      note: args.note ?? null,
      occurred_at: args.occurredAt ?? new Date().toISOString(),
      created_by: args.createdBy ?? null,
    })
    .select('*, client_contacts(name)')
    .single();
  if (error) return null;
  return data as ClientCommunicationEntry;
}

export interface UpdateCommunicationPatch {
  type?: CommType;
  direction?: CommDirection;
  outcome?: CommOutcome | null;
  note?: string | null;
  clientContactId?: string | null;
  occurredAt?: string;
}

/** Edit an existing entry (note, outcome, type, occurred_at, etc.). */
export async function updateClientCommunication(
  supabase: SupabaseClient,
  id: string,
  patch: UpdateCommunicationPatch,
): Promise<ClientCommunicationEntry | null> {
  const row: Record<string, unknown> = {};
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.direction !== undefined) row.direction = patch.direction;
  if (patch.outcome !== undefined) row.outcome = patch.outcome;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.clientContactId !== undefined) row.client_contact_id = patch.clientContactId;
  if (patch.occurredAt !== undefined) row.occurred_at = patch.occurredAt;

  const { data, error } = await supabase
    .from('client_communications')
    .update(row)
    .eq('id', id)
    .select('*, client_contacts(name)')
    .single();
  if (error) return null;
  return data as ClientCommunicationEntry;
}

/** Delete an entry. Returns true on success. */
export async function deleteClientCommunication(
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('client_communications')
    .delete()
    .eq('id', id);
  return !error;
}

/**
 * Load every communication for a client, newest first. Paginated via
 * fetchAll — a long-lived client can accumulate well past 1000 entries.
 */
export async function fetchClientCommunications(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ClientCommunicationEntry[]> {
  return fetchAll<ClientCommunicationEntry>((from, to) =>
    supabase
      .from('client_communications')
      .select('*, client_contacts(name)')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
  );
}
