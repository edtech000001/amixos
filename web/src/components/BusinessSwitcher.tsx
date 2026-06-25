'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Building2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/AppContext';
import { useLang } from '@/i18n/LangProvider';

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
  const { businesses, business, activeBusinessId, setActiveBusiness } = useApp();
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

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="max-w-full flex items-center gap-2 border border-gray-200 bg-white rounded-full pl-2 pr-3 py-1.5 shadow-sm hover:bg-gray-50 transition-colors"
        aria-label={tw.switcherLabel}
      >
        <span className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 size={12} className="text-primary" />
        </span>
        <span className="text-sm font-semibold text-gray-900 truncate min-w-0">
          {business.name}
        </span>
        <ChevronDown size={14} className="text-primary shrink-0" />
      </button>

      {open && pos
        ? createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-72 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden"
        >
          <div className="px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {tw.switcherLabel}
          </div>
          {businesses.map((b, i) => {
            const isActive = b.id === activeBusinessId;
            return (
              <button
                key={b.id}
                onClick={() => {
                  setActiveBusiness(b.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${
                  i < businesses.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 break-words">{b.name}</p>
                  {b.city ? (
                    <p className="text-xs text-gray-500 break-words">
                      {b.city}
                      {b.state ? `, ${b.state}` : ''}
                    </p>
                  ) : null}
                </div>
                {isActive ? <Check size={16} className="text-primary shrink-0" /> : null}
              </button>
            );
          })}
          <button
            onClick={() => {
              setOpen(false);
              router.push('/onboarding');
            }}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-100 hover:bg-gray-50 transition-colors text-left"
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
