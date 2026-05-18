// Backwards-compat shim. Auth state lives in ./auth/store now (Zustand).
// Existing dashboard files keep importing { useApp } from this path.
export { useApp } from './auth/store';
export type { AppUser, Business } from './auth/store';
