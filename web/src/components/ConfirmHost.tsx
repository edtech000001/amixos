'use client';

// Renders the in-app confirm/alert modal for the whole dashboard. Mounted once
// in the dashboard layout; registers itself with the confirm bus so any page or
// shared screen can call confirm()/alertMessage() and get a styled dialog
// instead of the browser's native window.confirm/alert.

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { registerConfirmHost, type ConfirmRequest } from '@amixos/shared/ui/confirmBus';
import { useLang } from '@/i18n/LangProvider';

interface Active extends ConfirmRequest {
  resolve: (result: boolean) => void;
}

export default function ConfirmHost() {
  const { t } = useLang();
  const b = t.common.buttons;
  const [active, setActive] = useState<Active | null>(null);

  useEffect(
    () => registerConfirmHost(req => new Promise<boolean>(resolve => setActive({ ...req, resolve }))),
    [],
  );

  if (!active) return null;

  const isConfirm = active.kind === 'confirm';
  const close = (result: boolean) => {
    active.resolve(result);
    setActive(null);
  };
  const confirmLabel = active.confirmText ?? (active.destructive ? b.delete : b.continue);
  const cancelLabel = active.cancelText ?? b.cancel;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onClick={() => close(false)}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-3 ${active.destructive ? 'bg-red-100' : 'bg-primary/10'}`}>
          <AlertTriangle size={20} className={active.destructive ? 'text-red-600' : 'text-primary'} />
        </div>
        {active.title ? <p className="text-lg font-bold text-gray-900">{active.title}</p> : null}
        <p className={`text-sm text-gray-600 ${active.title ? 'mt-1' : ''} whitespace-pre-line`}>{active.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          {isConfirm ? (
            <button
              onClick={() => close(false)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            autoFocus
            onClick={() => close(true)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 ${active.destructive ? 'bg-red-600' : 'bg-primary'}`}
          >
            {isConfirm ? confirmLabel : b.done}
          </button>
        </div>
      </div>
    </div>
  );
}
