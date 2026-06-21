// Helpers for the role editor (Ajustes/Team → Roles y permisos). Reads/writes
// the business_roles override table (migration 084) and diffs against the
// built-in defaults so we only persist real customizations.

import {
  DEFAULT_ROLE_PERMISSIONS,
  RESOURCE_KEYS,
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
];

export function isRoleEditable(role: Role): boolean {
  return role !== 'owner';
}

/** Deep-ish equality vs the built-in default for a role (decides save/delete). */
export function equalsDefault(role: Role, perms: RolePermissions): boolean {
  const def = DEFAULT_ROLE_PERMISSIONS[role];
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
        is_system: true,
        permissions: perms,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,key' },
    );
  return !error;
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
