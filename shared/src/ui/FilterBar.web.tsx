import { useEffect, useState, type ReactNode } from 'react';
import { Plus, X, Check, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { DateRangePreset } from '../lib/dateRangePresets';

type Icon = typeof Plus;

/**
 * One filter the bar can add. Boolean filters set `onToggle` (picking them
 * from the menu applies immediately); configurable ones set `panel`, opened
 * from the menu or by clicking their chip to edit.
 */
export interface BarFilter {
  key: string;
  /** Menu + chip prefix, e.g. "Date". */
  label: string;
  Icon?: Icon;
  active: boolean;
  /** Chip value when active, e.g. "Paid · This month". Omit for booleans. */
  value?: string;
  onRemove: () => void;
  onToggle?: () => void;
  panel?: (close: () => void) => ReactNode;
}

/**
 * Web list filters as removable chips + a "＋ Filter" menu (invoices, jobs).
 * Mobile's twin is the FilterSheet bottom sheet.
 */
export function FilterBar({
  filters,
  addLabel,
  clearAllLabel,
  toggleSectionLabel,
  className = '',
}: {
  filters: BarFilter[];
  addLabel: string;
  clearAllLabel: string;
  /** Caption above the one-tap filters in the add menu (e.g. "Show only"). */
  toggleSectionLabel?: string;
  className?: string;
}) {
  // 'menu' = the add menu; otherwise the key of the filter whose panel is
  // open, anchored to its chip (when active) or the add button.
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);
  const active = filters.filter(f => f.active);
  const addable = filters.filter(f => !f.active);
  const panelFor = (key: string) => filters.find(f => f.key === key && f.panel);

  const popover = (body: ReactNode, width = 'w-80') => (
    <>
      <div className="fixed inset-0 z-10" onClick={close} />
      <div className={`absolute left-0 top-full mt-2 z-20 ${width} bg-card rounded-2xl border border-border-soft shadow-lg`}>
        {body}
      </div>
    </>
  );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {active.map(f => (
        <div key={f.key} className="relative">
          <div className="flex items-center h-9 rounded-xl bg-primary/10 border border-primary/20 text-sm">
            <button
              type="button"
              onClick={() => (f.panel ? setOpen(f.key) : undefined)}
              className={`flex items-center gap-1.5 pl-3 pr-1 h-full ${f.panel ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {f.Icon ? <f.Icon size={14} className="text-primary" /> : null}
              {f.value ? (
                <>
                  <span className="text-muted">{f.label}</span>
                  <span className="font-semibold text-ink">{f.value}</span>
                </>
              ) : (
                <span className="font-semibold text-ink">{f.label}</span>
              )}
            </button>
            <button
              type="button"
              onClick={f.onRemove}
              aria-label={`${clearAllLabel}: ${f.label}`}
              className="px-2 h-full text-muted hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
          {open === f.key && f.panel ? popover(f.panel(close)) : null}
        </div>
      ))}

      {addable.length ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => (o ? null : 'menu'))}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-dashed border-border text-sm font-semibold text-muted hover:text-ink hover:bg-surface transition-colors"
          >
            <Plus size={15} /> {addLabel}
          </button>
          {open === 'menu' ? popover(
            <div className="p-1.5">
              {/* Filters that open a panel (›) first, then — under a divider —
                  the one-tap ones, so the menu doesn't read as one block. */}
              {[addable.filter(f => f.panel), addable.filter(f => !f.panel)].map((group, gi) => (
                group.length ? (
                  <div key={gi} className={gi === 1 && addable.some(f => f.panel) ? 'mt-1.5 pt-1.5 border-t border-border-soft' : ''}>
                    {gi === 1 && toggleSectionLabel ? (
                      <p className="px-3 pt-1 pb-1 text-[11px] font-semibold text-faint uppercase tracking-wider">{toggleSectionLabel}</p>
                    ) : null}
                    {group.map(f => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          if (f.panel) setOpen(`add:${f.key}`);
                          else { f.onToggle?.(); close(); }
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-ink text-left hover:bg-surface"
                      >
                        {f.Icon ? <f.Icon size={15} className="text-muted" /> : null}
                        <span className="flex-1">{f.label}</span>
                        {f.panel ? <ChevronRight size={14} className="text-faint" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null
              ))}
            </div>,
            'w-60',
          ) : null}
          {open?.startsWith('add:') ? (() => {
            const f = panelFor(open.slice(4));
            return f?.panel ? popover(f.panel(close)) : null;
          })() : null}
        </div>
      ) : null}

      {active.length > 1 ? (
        <button
          type="button"
          onClick={() => active.forEach(f => f.onRemove())}
          className="h-9 px-2 text-sm font-semibold text-muted hover:text-ink"
        >
          {clearAllLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Panel chrome: title, body, Cancel / Apply. */
export function FilterPanel({
  title,
  children,
  onCancel,
  onApply,
  cancelLabel,
  applyLabel,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onApply: () => void;
  cancelLabel: string;
  applyLabel: string;
}) {
  return (
    <div className="p-4">
      <p className="text-[11px] font-semibold text-faint uppercase tracking-wider mb-3">{title}</p>
      {children}
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 rounded-xl bg-border-soft text-sm font-semibold text-ink hover:bg-border">
          {cancelLabel}
        </button>
        <button type="button" onClick={onApply}
          className="flex-[2] py-2 rounded-xl bg-primary text-sm font-semibold text-white hover:opacity-90">
          {applyLabel}
        </button>
      </div>
    </div>
  );
}

/** Pick-one panel (radio rows), applied on Apply. */
export function RadioFilterPanel<K extends string>({
  title,
  options,
  value,
  onApply,
  onClose,
  cancelLabel,
  applyLabel,
}: {
  title: string;
  options: { key: K; label: string }[];
  value: K | null;
  onApply: (k: K) => void;
  onClose: () => void;
  cancelLabel: string;
  applyLabel: string;
}) {
  const [draft, setDraft] = useState<K>(value ?? options[0].key);
  return (
    <FilterPanel title={title} onCancel={onClose} onApply={() => { onApply(draft); onClose(); }} cancelLabel={cancelLabel} applyLabel={applyLabel}>
      <div className="space-y-1">
        {options.map(o => {
          const on = draft === o.key;
          return (
            <button key={o.key} type="button" onClick={() => setDraft(o.key)}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm text-left ${on ? 'bg-primary/10 text-primary font-semibold' : 'text-ink hover:bg-surface'}`}>
              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${on ? 'border-primary' : 'border-border'}`}>
                {on ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    </FilterPanel>
  );
}

/**
 * Date-range panel: optional "which date" switch, preset chips, From/To.
 * Edits a draft; nothing changes until Apply.
 */
export function DateFilterPanel<F extends string>({
  title,
  fields,
  fieldLabel,
  field,
  presets,
  from,
  to,
  onApply,
  onClose,
  labels,
}: {
  title: string;
  fields?: { key: F; label: string }[];
  fieldLabel?: string;
  field?: F;
  presets: DateRangePreset[];
  from: string | null;
  to: string | null;
  onApply: (next: { field?: F; from: string | null; to: string | null; preset: DateRangePreset | null }) => void;
  onClose: () => void;
  labels: { from: string; to: string; cancel: string; apply: string };
}) {
  const [dField, setDField] = useState<F | undefined>(field);
  const [dFrom, setDFrom] = useState(from);
  const [dTo, setDTo] = useState(to);
  const [dPreset, setDPreset] = useState<DateRangePreset | null>(
    presets.find(p => p.from === from && p.to === to) ?? null,
  );
  const input = 'w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary';
  return (
    <FilterPanel
      title={title}
      onCancel={onClose}
      onApply={() => { onApply({ field: dField, from: dFrom, to: dTo, preset: dPreset }); onClose(); }}
      cancelLabel={labels.cancel}
      applyLabel={labels.apply}
    >
      {fields?.length ? (
        <>
          {fieldLabel ? <p className="text-xs font-medium text-muted mb-1.5">{fieldLabel}</p> : null}
          <div className="flex p-1 rounded-xl bg-border-soft mb-3">
            {fields.map(f => (
              <button key={f.key} type="button" onClick={() => setDField(f.key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dField === f.key ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {presets.map(p => {
          const on = dFrom === p.from && dTo === p.to;
          return (
            <button key={p.key} type="button"
              onClick={() => { setDFrom(p.from); setDTo(p.to); setDPreset(p); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                on ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
              }`}>
              {on ? <Check size={11} /> : null}
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs font-medium text-muted mb-1">{labels.from}</span>
          <input type="date" value={dFrom ?? ''} onChange={e => { setDFrom(e.target.value || null); setDPreset(null); }} className={input} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-muted mb-1">{labels.to}</span>
          <input type="date" value={dTo ?? ''} onChange={e => { setDTo(e.target.value || null); setDPreset(null); }} className={input} />
        </label>
      </div>
    </FilterPanel>
  );
}

/** Chip text for a date range: the preset's name, else "Oct 1 – Oct 31, 2026". */
export function dateRangeChipText(
  from: string | null,
  to: string | null,
  presetLabel: string | null | undefined,
  locale: string,
): string {
  if (presetLabel) return presetLabel;
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  if (from && to) return `${f(from)} – ${f(to)}`;
  if (from) return `≥ ${f(from)}`;
  if (to) return `≤ ${f(to)}`;
  return '';
}

/** Pick-several panel (checkbox rows with counts + search), applied on Apply. */
export function CheckListFilterPanel({
  title,
  options,
  value,
  onApply,
  onClose,
  cancelLabel,
  applyLabel,
  searchPlaceholder,
}: {
  title: string;
  options: { key: string; label: string; count?: number; muted?: boolean }[];
  value: string[];
  onApply: (keys: string[]) => void;
  onClose: () => void;
  cancelLabel: string;
  applyLabel: string;
  searchPlaceholder?: string;
}) {
  const [draft, setDraft] = useState<string[]>(value);
  const [q, setQ] = useState('');
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const shown = q.trim() ? options.filter(o => norm(o.label).includes(norm(q.trim()))) : options;
  return (
    <FilterPanel title={title} onCancel={onClose} onApply={() => { onApply(draft); onClose(); }} cancelLabel={cancelLabel} applyLabel={applyLabel}>
      {options.length > 8 ? (
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full mb-2 rounded-xl border border-border bg-card px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        />
      ) : null}
      <div className="max-h-60 overflow-y-auto space-y-0.5">
        {shown.map(o => {
          const on = draft.includes(o.key);
          return (
            <button key={o.key || '(empty)'} type="button"
              onClick={() => setDraft(d => (on ? d.filter(k => k !== o.key) : [...d, o.key]))}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-sm text-left ${on ? 'bg-primary/10' : 'hover:bg-surface'}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary' : 'border-border bg-card'}`}>
                {on ? <Check size={11} className="text-white" /> : null}
              </span>
              <span className={`flex-1 truncate ${o.muted ? 'italic text-faint' : on ? 'text-primary font-semibold' : 'text-ink'}`}>{o.label}</span>
              {o.count != null ? <span className="text-xs text-faint">{o.count}</span> : null}
            </button>
          );
        })}
      </div>
    </FilterPanel>
  );
}

/**
 * Web lists' one "Sort & group" header button (mobile: the Filters sheet's
 * first two sections). Sort rows: tap → select, again → reverse, third tap →
 * clear (sortCycle — the caller's onSortTap). Group rows: tap the selected one
 * again to clear it (the caller's onGroupTap).
 */
export function SortGroupMenu<S extends string, G extends string>({
  sortOptions,
  sortBy,
  sortDesc,
  caption,
  hint,
  onSortTap,
  groupOptions,
  groupBy,
  baseGroup,
  onGroupTap,
  active,
  labels,
}: {
  sortOptions: { key: S; label: string }[];
  sortBy: S;
  /** Effective direction of the CURRENT sort. */
  sortDesc: boolean;
  /** Direction caption for a sort ("Newest first"). */
  caption: (k: S, desc: boolean) => string;
  /** "Tap again to reverse" / "Tap again to clear". */
  hint: string;
  onSortTap: (k: S) => void;
  /** Omit to show sort only. */
  groupOptions?: { key: G; label: string; Icon?: Icon }[];
  groupBy?: G;
  baseGroup?: G;
  onGroupTap?: (k: G) => void;
  /** Highlight the button (non-default sort or any grouping). */
  active: boolean;
  /** buttonLabel: the button's FIXED text — the current sort/group would
   *  change its width and shift the header on every pick. */
  labels: { sortBy: string; groupBy: string; buttonLabel: string };
}) {
  const [open, setOpen] = useState(false);
  void baseGroup;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold shadow-sm transition-colors ${
          active ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted hover:bg-surface'
        }`}
      >
        <ArrowUpDown size={15} />
        {labels.buttonLabel}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-72 bg-card rounded-2xl border border-border-soft shadow-lg p-2">
            <p className="text-[11px] font-semibold text-faint uppercase tracking-wider px-2 pt-1 pb-2">{labels.sortBy}</p>
            {sortOptions.map(o => {
              const selected = sortBy === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => onSortTap(o.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left ${selected ? 'bg-primary/10' : 'hover:bg-surface'}`}
                >
                  <span className="flex-1">
                    <span className={`block text-sm ${selected ? 'text-primary font-semibold' : 'text-ink'}`}>{o.label}</span>
                    {selected ? <span className="block text-[11px] text-muted">{caption(o.key, sortDesc)} · {hint}</span> : null}
                  </span>
                  {selected ? (sortDesc ? <ArrowDown size={15} className="text-primary" /> : <ArrowUp size={15} className="text-primary" />) : null}
                </button>
              );
            })}
            {groupOptions?.length && onGroupTap ? (
              <div className="mt-2 pt-2 border-t border-border-soft">
                <p className="text-[11px] font-semibold text-faint uppercase tracking-wider px-2 pt-1 pb-2">{labels.groupBy}</p>
                {groupOptions.map(o => {
                  const selected = groupBy === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => onGroupTap(o.key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm ${
                        selected ? 'bg-primary/10 text-primary font-semibold' : 'text-ink hover:bg-surface'
                      }`}
                    >
                      {o.Icon ? <o.Icon size={15} className={selected ? 'text-primary' : 'text-muted'} /> : null}
                      <span className="flex-1">{o.label}</span>
                      {selected ? <Check size={15} className="text-primary" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** CheckListFilterPanel whose options load on open (jobs field filters). */
export function AsyncCheckListFilterPanel({
  title,
  load,
  labelOf,
  value,
  onApply,
  onClose,
  labels,
}: {
  title: string;
  load: () => Promise<{ value: string; label: string; count: number }[]>;
  labelOf: (value: string, label: string) => string;
  value: string[];
  /** Picked values with their display labels (saved with the filter). */
  onApply: (picked: { v: string; l: string }[]) => void;
  onClose: () => void;
  labels: { cancel: string; apply: string; search: string; loading: string; none: string };
}) {
  const [values, setValues] = useState<{ value: string; label: string; count: number }[] | null>(null);
  // The load error's text — shown instead of "no values", so a failing RPC
  // (e.g. a migration not run) doesn't read as an empty field.
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    load().then(v => { if (active) setValues(v); }).catch((e: unknown) => {
      console.error('[filters] load values failed', e);
      if (active) setFailed(e instanceof Error ? e.message : String(e));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!values) {
    return (
      <FilterPanel title={title} onCancel={onClose} onApply={onClose} cancelLabel={labels.cancel} applyLabel={labels.apply}>
        <p className={`text-sm py-3 ${failed ? 'text-red-500' : 'text-faint'}`}>{failed ?? labels.loading}</p>
      </FilterPanel>
    );
  }
  if (!values.length) {
    return (
      <FilterPanel title={title} onCancel={onClose} onApply={onClose} cancelLabel={labels.cancel} applyLabel={labels.apply}>
        <p className="text-sm text-faint py-3">{labels.none}</p>
      </FilterPanel>
    );
  }
  const byValue = new Map(values.map(v => [v.value, v]));
  return (
    <CheckListFilterPanel
      title={title}
      options={values.map(v => ({ key: v.value, label: labelOf(v.value, v.label), count: v.count, muted: v.value === '' }))}
      value={value}
      onApply={keys => onApply(keys.map(k => ({ v: k, l: byValue.get(k)?.label ?? k })))}
      onClose={onClose}
      cancelLabel={labels.cancel}
      applyLabel={labels.apply}
      searchPlaceholder={labels.search}
    />
  );
}
