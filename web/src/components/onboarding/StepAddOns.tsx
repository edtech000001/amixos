'use client';

import { Package, Phone, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { clsx } from 'clsx';
import { useLang } from '@/i18n/LangProvider';

interface Props {
  needsInventory: boolean;
  needsVirtualNumber: boolean;
  onChange: (fields: { needsInventory?: boolean; needsVirtualNumber?: boolean }) => void;
  onFinish: () => void;
  onBack: () => void;
  loading: boolean;
  error?: string;
}

export function StepAddOns({ needsInventory, needsVirtualNumber, onChange, onFinish, onBack, loading, error }: Props) {
  const { t: full } = useLang();
  const t = full.onboarding.addOns;
  const values = { needsInventory, needsVirtualNumber };

  const addOns = [
    {
      key: 'needsInventory' as const,
      icon: Package,
      title: t.inventoryTitle,
      description: t.inventoryDesc,
      note: t.inventoryNote,
    },
    {
      key: 'needsVirtualNumber' as const,
      icon: Phone,
      title: t.voipTitle,
      description: t.voipDesc,
      note: t.voipNote,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t.heading}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.sub}</p>
      </div>

      <div className="flex flex-col gap-3">
        {addOns.map(({ key, icon: Icon, title, description, note }) => {
          const active = values[key];
          return (
            <button
              key={key}
              onClick={() => onChange({ [key]: !active })}
              className={clsx(
                'flex gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
              )}
            >
              <div className={clsx(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
              )}>
                {active ? <Check size={18} /> : <Icon size={18} />}
              </div>
              <div>
                <p className={clsx('font-semibold text-sm', active ? 'text-primary' : 'text-gray-800')}>{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                <p className="text-xs text-gray-400 mt-1 italic">{note}</p>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} size="lg" className="flex-1">{t.back}</Button>
        <Button onClick={onFinish} loading={loading} size="lg" className="flex-1">
          {t.finish}
        </Button>
      </div>
    </div>
  );
}
