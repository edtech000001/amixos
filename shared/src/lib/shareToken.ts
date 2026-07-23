// A hard-to-guess token for public share links (invoices, proposals). These
// tokens are the ONLY thing gating anonymous read access to a shared document
// (via the get_shared_invoice / get_shared_proposal RPCs), so they must not be
// predictable.
//
// Prefers the platform's cryptographic RNG so tokens aren't recoverable
// Math.random output. Browsers always have it; the mobile app polyfills
// crypto.getRandomValues at entry (react-native-get-random-values in
// app/_layout.tsx), so the getRandomValues branch below is taken there too.
// The Math.random fallback is a last resort for an exotic runtime with no
// secure RNG at all — it keeps sharing working rather than throwing.
export function secureShareToken(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(24);
    c.getRandomValues(bytes);
    return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  // Last-resort fallback (no secure RNG available) — still unguessable enough
  // for a share link, just not cryptographically strong.
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}
