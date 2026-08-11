// Helpers for the role editor (Ajustes/Team → Roles y permisos). Reads/writes
// the business_roles override table (migration 084) and diffs against the
// built-in defaults so we only persist real customizations.

import {
  DEFAULT_ROLE_PERMISSIONS,
  RESOURCE_KEYS,
  isCustomRole,
  type Role,
  type RolePermissions,
  type ResourceKey,
  type CapabilityKey,
} from './permissions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

// Owner is never editable — always full control, can't be locked out.
export const EDITABLE_ROLES: Role[] = ['admin', 'manager', 'office', 'field', 'viewer'];

// System capabilities surfaced in the editor's "Administration" section. The
// rest stay governed by defaults (billing/delete-business are owner-only).
export const EDITABLE_CAPS: CapabilityKey[] = [
  'manageSettings',
  'manageMembers',
  'viewAuditLog',
  'viewAllTimesheets',
  'assignWorkers',
  'createEstimates',
  'clockInOut',
  'scheduleJobs',
  'completedByDefault',
  'switchLocations',
];

// Caps that only govern field-crew surfaces (the field home clock card, and
// whether field crew may schedule vs record-completed-only). They're no-ops for
// roles that already see all jobs, so the editor only shows them for 'field'.
export const FIELD_ONLY_CAPS: CapabilityKey[] = ['clockInOut', 'scheduleJobs'];

/** Whether a capability toggle is meaningful for a given role (drives editor
 *  visibility). Field-only caps are hidden for every non-field built-in role;
 *  custom roles show them (they can be configured field-like). */
export function capAppliesToRole(cap: CapabilityKey, role: Role): boolean {
  return FIELD_ONLY_CAPS.includes(cap) ? role === 'field' || isCustomRole(role) : true;
}

export function isRoleEditable(role: Role): boolean {
  return role !== 'owner';
}

/** Deep-ish equality vs the built-in default for a role (decides save/delete).
 *  Custom roles have no default — never "equal", their row is never deleted. */
export function equalsDefault(role: Role, perms: RolePermissions): boolean {
  const def = DEFAULT_ROLE_PERMISSIONS[role];
  if (!def) return false;
  for (const k of RESOURCE_KEYS) {
    const a = perms.resources[k];
    const b = def.resources[k];
    if (a.view !== b.view || a.create !== b.create || a.edit !== b.edit || a.delete !== b.delete) {
      return false;
    }
  }
  for (const key of Object.keys(def.caps) as CapabilityKey[]) {
    if (perms.caps[key] !== def.caps[key]) return false;
  }
  return true;
}

/** Structured clone of a role's permissions (defaults or an override) for editing. */
export function clonePermissions(perms: RolePermissions): RolePermissions {
  const resources = {} as Record<ResourceKey, RolePermissions['resources'][ResourceKey]>;
  for (const k of RESOURCE_KEYS) resources[k] = { ...perms.resources[k] };
  return { resources, caps: { ...perms.caps } };
}

/**
 * Persist a role's permissions for a business. If the grid matches the
 * built-in default we delete any override row instead (keeps the table to
 * real customizations + lets future default changes flow through). Returns
 * true on success.
 */
export async function saveRoleOverride(
  supabase: SupabaseLike,
  businessId: string,
  role: Role,
  perms: RolePermissions,
): Promise<boolean> {
  if (equalsDefault(role, perms)) {
    return resetRoleOverride(supabase, businessId, role);
  }
  const { error } = await supabase
    .from('business_roles')
    .upsert(
      {
        business_id: businessId,
        key: role,
        is_system: !isCustomRole(role),
        permissions: perms,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,key' },
    );
  return !error;
}

// ─── Custom roles (business_roles rows with is_system=false) ───────────────

/** Slug for a new custom role key: `c_` prefix (never collides with built-ins
 *  or future system keys) + normalized name. */
export function customRoleKey(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return `c_${slug || 'rol'}`;
}

/**
 * Create a custom role: full permissions snapshot cloned from a built-in base
 * role. Returns the new key, or null on failure (e.g. duplicate name/key).
 */
export async function createCustomRole(
  supabase: SupabaseLike,
  businessId: string,
  name: string,
  baseRole: Role,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const key = customRoleKey(trimmed);
  if (key in DEFAULT_ROLE_PERMISSIONS) return null;
  const base = DEFAULT_ROLE_PERMISSIONS[baseRole] ?? DEFAULT_ROLE_PERMISSIONS.viewer;
  const { error } = await supabase.from('business_roles').insert({
    business_id: businessId,
    key,
    name: trimmed,
    is_system: false,
    permissions: clonePermissions(base),
  });
  return error ? null : key;
}

/** Rename a custom role (display name only — the key never changes). */
export async function renameCustomRole(
  supabase: SupabaseLike,
  businessId: string,
  key: string,
  name: string,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const { error } = await supabase
    .from('business_roles')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('key', key)
    .eq('is_system', false);
  return !error;
}

/**
 * Delete a custom role. The DB blocks deletion while members or pending
 * invites still hold the key (migration 179 trigger) — that surfaces as
 * `{ ok: false, inUse: true }` so the UI can tell the admin to reassign first.
 */
export async function deleteCustomRole(
  supabase: SupabaseLike,
  businessId: string,
  key: string,
): Promise<{ ok: boolean; inUse: boolean }> {
  const { error } = await supabase
    .from('business_roles')
    .delete()
    .eq('business_id', businessId)
    .eq('key', key)
    .eq('is_system', false);
  if (!error) return { ok: true, inUse: false };
  return { ok: false, inUse: /role in use|23503/i.test(error.message ?? '') };
}

/** Remove a role's override (revert to built-in default). */
export async function resetRoleOverride(
  supabase: SupabaseLike,
  businessId: string,
  role: Role,
): Promise<boolean> {
  const { error } = await supabase
    .from('business_roles')
    .delete()
    .eq('business_id', businessId)
    .eq('key', role);
  return !error;
}
