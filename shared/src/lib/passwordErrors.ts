// Turning Supabase Auth password rejections into something a Spanish-speaking
// user can act on.
//
// The project enforces, server-side: a minimum length, one character from each
// of four classes, and a HaveIBeenPwned check (Authentication → Attack
// Protection / Email provider). GoTrue rejects with an ENGLISH message that
// lists the raw character classes — unusable in a Spanish-first app, and it
// tells the user nothing they can act on anyway.
//
// So we never show error.message. We classify, and the caller picks a
// localized string. Classification reads the structured fields first
// (`code`, and `reasons` on AuthWeakPasswordError) because those are stable
// across GoTrue versions; the message sniffing below is only a fallback for
// older servers that answered before the codes existed.

/** What was actually wrong with the password. */
export type PasswordIssue =
  | 'pwned'          // appears in a known breach corpus
  | 'characters'     // missing a required character class
  | 'length'         // shorter than the project minimum
  | 'same'           // identical to the password already on the account
  | 'current-wrong'  // the CURRENT password supplied for verification is wrong
  | 'generic';

/** Character classes the Supabase project requires, mirrored client-side so
 *  the user is told in Spanish before a round-trip. Keep in step with
 *  Authentication → Sign In / Providers → Email → Password requirements. */
export const PASSWORD_CLASSES = [
  /[a-z]/,
  /[A-Z]/,
  /[0-9]/,
  /[^a-zA-Z0-9]/,
] as const;

export const PASSWORD_MIN_LENGTH = 8;

/** True when the password satisfies every rule we can check without the
 *  server. A `true` here is not a guarantee — only the server knows whether
 *  the password has been breached. */
export function passwordMeetsPolicy(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH
    && PASSWORD_CLASSES.every((re) => re.test(password));
}

type MaybeAuthError = {
  code?: string;
  message?: string;
  reasons?: string[];
} | null | undefined;

export function classifyPasswordError(error: MaybeAuthError): PasswordIssue {
  if (!error) return 'generic';

  // `reasons` is only present on AuthWeakPasswordError and is the most precise
  // signal we get: 'pwned' | 'characters' | 'length'.
  const reasons = Array.isArray(error.reasons) ? error.reasons : [];
  if (reasons.includes('pwned')) return 'pwned';
  if (reasons.includes('characters')) return 'characters';
  if (reasons.includes('length')) return 'length';

  switch (error.code) {
    case 'same_password': return 'same';
    case 'invalid_credentials': return 'current-wrong';
    // weak_password with no reasons array — fall through to the message.
    case 'weak_password': break;
    default: break;
  }

  const m = (error.message ?? '').toLowerCase();
  // GoTrue's pwned wording; matched on the distinctive half so a reworded
  // prefix does not break it.
  if (m.includes('easy to guess') || m.includes('known to be weak')) return 'pwned';
  if (m.includes('should contain at least one character')) return 'characters';
  if (m.includes('should be at least')) return 'length';
  if (m.includes('should be different from the old')) return 'same';
  if (m.includes('invalid login credentials')) return 'current-wrong';

  return error.code === 'weak_password' ? 'characters' : 'generic';
}
