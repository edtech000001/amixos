// Derive a human display name for the signed-in user. Owners see their business
// name in the header; non-owner/field crew don't (no logo, single business), so
// their home greets them by name instead. Source of truth is the auth user's
// metadata (full_name/name set at signup or via OAuth), falling back to the
// local part of the email when no name was provided.

interface AuthUserLike {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** Full display name, e.g. "Bob Smith" — or the email's local part, or ''. */
export function displayNameFromUser(user: AuthUserLike | null | undefined): string {
  if (!user) return '';
  const meta = user.user_metadata ?? {};
  const candidate = meta.full_name ?? meta.name ?? meta.first_name;
  const full = typeof candidate === 'string' ? candidate.trim() : '';
  if (full) return full;
  const email = user.email ?? '';
  return email ? email.split('@')[0] : '';
}

/** First token of a display name, e.g. "Bob Smith" → "Bob". */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}
