// Client-generated row ids for offline creates.
//
// An offline create can't get a server-assigned id, and dependent inserts (or
// navigation to the new record) need an id immediately. Generating a UUID on
// the device solves both: the row carries its id across the offline→online
// boundary, so syncing is a blind replay.
//
// Math.random-based v4 (not crypto) — fine for primary keys (collision odds are
// negligible) and needs no native module, so no dev-client rebuild.
export function newUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
