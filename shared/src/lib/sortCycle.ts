// One tap rule for every list's sort chips (invoices, jobs, clients):
//   tap a new sort      → select it, its default direction
//   tap it again        → reverse it
//   tap it a third time → clear it, back to the list's base sort
// The base sort itself just flips between its two directions.

export function cycleSort<K extends string>(
  tapped: K,
  current: K,
  currentDesc: boolean | null,
  defaultDesc: (k: K) => boolean,
  base: K,
): { sortBy: K; sortDesc: boolean | null } {
  if (tapped !== current) return { sortBy: tapped, sortDesc: null };
  const desc = currentDesc ?? defaultDesc(tapped);
  if (desc === defaultDesc(tapped)) return { sortBy: tapped, sortDesc: !desc };
  return { sortBy: base, sortDesc: null };
}

/** Whether the next tap on the selected sort clears it (vs reverses it). */
export function sortTapClears<K extends string>(
  k: K,
  currentDesc: boolean | null,
  defaultDesc: (k: K) => boolean,
  base: K,
): boolean {
  return k !== base && (currentDesc ?? defaultDesc(k)) !== defaultDesc(k);
}
