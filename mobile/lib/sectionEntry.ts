// Which dock sections currently hold a screen the user did NOT navigate to
// through that section's own list.
//
// Opening a job from the dashboard (or the map, calendar, payroll, an
// invoice…) pushes it onto the Trabajos stack by path, so the Jobs tab later
// restores that job instead of the list — after a few of those the tab needs
// one back press per visit to reach the list.
//
// Reading this off the navigator state proved unreliable (params get cleared,
// nesting varies), so the intent is recorded explicitly at the moment of
// navigation: the caller marks the section it is pushing INTO, the section's
// own list clears the mark when the user navigates from within it, and the
// dock resets a marked section to its list when the user enters it.

const marked = new Set<string>();

/** Opening a detail screen that lives in `section` from somewhere else. */
export function markSectionVisitor(section: string): void {
  marked.add(section);
}

/** The user navigated inside `section` (its list opened the detail). */
export function clearSectionVisitor(section: string): void {
  marked.delete(section);
}

export function hasSectionVisitor(section: string): boolean {
  return marked.has(section);
}
