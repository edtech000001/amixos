// Support / feedback contact.
//
// TODO: replace SUPPORT_EMAIL with the real inbox once it's chosen. This is
// the single source of truth — the Settings "Support & feedback" card on web
// and mobile both read it.
export const SUPPORT_EMAIL = 'soporte@amixos.com';

/**
 * Build a `mailto:` link to support with a context footer appended (account
 * email, business, platform) so reports arrive with enough to debug. The user
 * writes their message above the separator.
 */
export function buildSupportMailto(opts: {
  subject: string;
  userEmail?: string | null;
  businessName?: string | null;
  platform: string;
}): string {
  const footer = [
    '',
    '',
    '——————————',
    `App: Amixos (${opts.platform})`,
    opts.businessName ? `Negocio: ${opts.businessName}` : null,
    opts.userEmail ? `Cuenta: ${opts.userEmail}` : null,
  ]
    .filter(v => v !== null)
    .join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(footer)}`;
}
