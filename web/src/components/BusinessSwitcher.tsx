'use client';

import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Building2, Plus, GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';
import { createSupabaseClient } from '@/lib/supabase';
import { SortableList } from '@/components/dashboard/SortableList';

/**
 * Click the active business name to drop down a list of every business the
 * user is a member of. Picking one flips the entire app's data context via
 * setActiveBusiness. Hidden when the user only belongs to one business.
 *
 * The menu is rendered in a PORTAL to document.body and positioned under the
 * button. The switcher lives in a `sticky` sidebar narrower than the menu, and
 * `sticky` creates a stacking context — so an in-flow absolute menu gets
 * clipped/painted over by the main content it overflows into. Portaling escapes
 * that entirely so the menu is always on top.
 */
export function BusinessSwitcher() {
  const { businesses, business, activeBusinessId, setActiveBusiness, user, reorderBusinesses } = useApp();
  const supabase = createSupabaseClient();

  /**
   * Drag a row by its grip to reorder. The order is per user (business_members
   * .sort_order, migration 217), so this only ever moves the switcher for the
   * person doing it. The local list is updated first so the row does not snap
   * back while the writes land.
   */
  const persistOrder = async (next: typeof businesses) => {
    reorderBusinesses(next.map(b => b.id));
    if (!user?.id) return;
    for (let i = 0; i < next.length; i++) {
      await supabase
        .from('business_members')
        .update({ sort_order: i })
        .eq('user_id', user.id)
        .eq('business_id', next[i].id);
    }
  };
  const { t: full } = useLang();
  const tw = full.dashboard.workspaces;
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: r.left });
    };
    update();
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Reposition if the layout shifts under the open menu.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  if (!business) return null;

  /** One switcher row. Shared by the sortable and plain lists so the two can
   *  never drift apart visually. */
  const renderRow = (
    b: (typeof businesses)[number],
    i: number,
    handle?: { attributes?: HTMLAttributes<HTMLElement>; listeners?: HTMLAttributes<HTMLElement> },
  ) => {
    const isActive = b.id === activeBusinessId;
    return (
      <div key={b.id} className="relative flex items-center">
        {handle ? (
          <span
            {...(handle.attributes ?? {})}
            {...(handle.listeners ?? {})}
            className="pl-2 cursor-grab active:cursor-grabbing text-faint hover:text-muted"
          >
            <GripVertical size={14} />
          </span>
        ) : null}

            return (
              <button
                key={b.id}
                onClick={() => {
                  const switching = b.id !== activeBusinessId;
                  setActiveBusiness(b.id);
                  setOpen(false);
                  // Land on the dashboard so nothing scoped to the previous
                  // business (a detail page, an open modal, a module) is left
                  // showing stale/out-of-context data. Only on a real switch.
                  if (switching) router.push('/dashboard');
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left ${
                  i < businesses.length - 1 ? 'border-b border-border-soft' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink break-words">{b.name}</p>
                  {b.city ? (
                    <p className="text-xs text-muted break-words">
                      {b.city}
                      {b.state ? `, ${b.state}` : ''}
                    </p>
                  ) : null}
                </div>
                {isActive ? <Check size={16} className="text-primary shrink-0" /> : null}
              </button>
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="max-w-full flex items-center gap-2 border border-border bg-elevated rounded-full pl-2 pr-3 py-1.5 shadow-sm hover:bg-surface transition-colors"
        aria-label={tw.switcherLabel}
      >
        <span className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 size={12} className="text-primary" />
        </span>
        <span className="text-sm font-semibold text-ink truncate min-w-0">
          {business.name}
        </span>
        <ChevronDown size={14} className="text-primary shrink-0" />
      </button>

      {open && pos
        ? createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-72 bg-elevated rounded-2xl border border-border-soft shadow-xl overflow-hidden"
        >
          <div className="px-4 py-2 text-[10px] font-semibold text-faint uppercase tracking-wider">
            {tw.switcherLabel}
          </div>
          {businesses.length > 1 ? (
            <p className="px-4 pb-1 text-[10px] text-faint">{tw.reorderHint}</p>
          ) : null}
          {businesses.length > 1 ? (
            <SortableList
              items={businesses}
              onReorder={next => { void persistOrder(next); }}
              renderItem={(b, i, handle) => renderRow(b, i, handle)}
            />
          ) : businesses.map((b, i) => renderRow(b, i))}
          <button
            onClick={() => {
              setOpen(false);
              // adding=1 → onboarding shows a "Cancel" escape (the user already
              // has a business and can back out).
              router.push('/onboarding?adding=1');
            }}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-border-soft hover:bg-surface transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Plus size={16} className="text-primary" />
            </div>
            <span className="text-sm font-semibold text-primary">{tw.createBusiness}</span>
          </button>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
