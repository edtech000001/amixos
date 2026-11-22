// Barge-in for Ami's voice call (web + mobile): while she talks the mic stays
// open, and these decide whether what it heard is the user cutting in or just
// her own voice leaking back from the speaker.

const words = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9ñ]+/g) ?? ([] as string[]);
// One-word barge-ins that clearly mean "stop".
const STOP_WORDS = new Set(['ami', 'para', 'espera', 'alto', 'stop', 'wait', 'oye', 'hey', 'ok', 'okay', 'no']);

/** True when what the mic heard is (mostly) Ami's own voice leaking back in. */
export function echoesReply(heard: string, reply: string): boolean {
  const h = words(heard);
  if (!h.length) return true;
  const r = new Set(words(reply));
  return h.filter(w => r.has(w)).length / h.length >= 0.6;
}

/** Should what the mic heard while Ami talks cut her off? */
export function isBargeIn(heard: string, reply: string): boolean {
  const h = words(heard);
  if (h.length === 1) return STOP_WORDS.has(h[0]) && !words(reply).includes(h[0]);
  return h.length >= 2 && !echoesReply(heard, reply);
}
