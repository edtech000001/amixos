// Lightweight input validators shared across web + mobile forms so the
// same rules apply everywhere (and we don't reinvent regexes per screen).

// Pragmatic email check — deliberately NOT RFC-5322-perfect (that's not
// achievable with a sane regex). It catches the realistic typos: missing
// "@", missing domain, missing TLD, and stray whitespace. Callers treat an
// empty string as valid since these fields are optional — only validate
// when the user actually typed something.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
