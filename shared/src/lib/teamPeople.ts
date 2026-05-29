// Phase 1 of merging Empleados + Equipo into one "Equipo" (people) list.
//
// Derives each person's app-access status by matching the HR roster
// (employees) against app accounts (business_members) and pending invites —
// WITHOUT any schema change. Matching rules:
//   employee ⇄ member  by user_id, then by email (case-insensitive)
//   employee ⇄ invite  by email (case-insensitive)
// Members/invites with no employee row are "orphans" — surfaced as their own
// person rows so the list is always complete (owner, legacy app users, etc.).

import type { Role } from './permissions';

export type AccessStatus =
  | { kind: 'active'; role: Role; memberId: string; isYou: boolean }
  | { kind: 'invited'; role: Role; inviteId: string }
  | { kind: 'none' };

export interface AccessMember {
  id: string;            // business_members.id
  userId: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  isYou: boolean;
}

export interface AccessInvite {
  id: string;
  email: string;
  role: Role;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** App-access status for one employee, given the business's members + invites. */
export function resolveAccess(
  employee: { userId: string | null; email: string | null },
  members: AccessMember[],
  invites: AccessInvite[],
): AccessStatus {
  if (employee.userId) {
    const m = members.find((x) => x.userId === employee.userId);
    if (m) return { kind: 'active', role: m.role, memberId: m.id, isYou: m.isYou };
  }
  const email = norm(employee.email);
  if (email) {
    const m = members.find((x) => norm(x.email) === email);
    if (m) return { kind: 'active', role: m.role, memberId: m.id, isYou: m.isYou };
    const inv = invites.find((x) => norm(x.email) === email);
    if (inv) return { kind: 'invited', role: inv.role, inviteId: inv.id };
  }
  return { kind: 'none' };
}

/**
 * Members that don't correspond to any employee (matched by user_id or email).
 * These are app accounts without an HR record — e.g. the owner, or users who
 * accepted before being added as an employee.
 */
export function orphanMembers(
  members: AccessMember[],
  employees: { userId: string | null; email: string | null }[],
): AccessMember[] {
  const empUserIds = new Set(employees.map((e) => e.userId).filter(Boolean) as string[]);
  const empEmails = new Set(employees.map((e) => norm(e.email)).filter(Boolean));
  return members.filter(
    (m) => !empUserIds.has(m.userId) && !empEmails.has(norm(m.email)),
  );
}

/** Pending invites whose email matches neither an employee nor a member. */
export function orphanInvites(
  invites: AccessInvite[],
  employees: { email: string | null }[],
  members: AccessMember[],
): AccessInvite[] {
  const taken = new Set<string>([
    ...employees.map((e) => norm(e.email)).filter(Boolean),
    ...members.map((m) => norm(m.email)).filter(Boolean),
  ]);
  return invites.filter((i) => !taken.has(norm(i.email)));
}

/** Best name for a member/invite that has no employee record yet. */
export function displayNameFromAccount(
  account: { displayName?: string | null; email: string | null },
): string {
  if (account.displayName && account.displayName.trim()) return account.displayName.trim();
  const email = account.email ?? '';
  const local = email.split('@')[0] ?? '';
  return local || email || '—';
}
