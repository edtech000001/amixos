// Bridges the dock to the currently-focused form's unsaved-changes guard.
//
// The active form registers `request` (via useUnsavedGuard, while focused).
// Before the dock navigates away from a section (e.g. re-tapping its icon to
// jump to the list), it calls `request(proceed)`: a dirty form shows the
// "Cambios sin guardar" sheet and only runs `proceed` on "Salir sin guardar";
// a clean form (or no guard registered) runs `proceed` immediately.
//
// `request === null` ⇒ no guarded form is focused ⇒ callers just navigate.

import { create } from 'zustand';

interface LeaveGuardState {
  request: ((proceed: () => void) => void) | null;
  setRequest: (fn: ((proceed: () => void) => void) | null) => void;
}

export const useLeaveGuardStore = create<LeaveGuardState>(set => ({
  request: null,
  setRequest: fn => set({ request: fn }),
}));
