'use client';

import { useState } from 'react';
import { Wrench, HardHat, Scissors, Utensils, Home, Phone, Car, ShoppingBag, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { clsx } from 'clsx';
import { useLang } from '@/i18n/LangProvider';

const ICONS: Record<string, typeof Wrench> = {
  construction: HardHat,
  mechanics: Wrench,
  landscaping: Home,
  cleaning: Scissors,
  restaurant: Utensils,
  phone_repair: Phone,
  car_dealership: Car,
  retail: ShoppingBag,
  other: MoreHorizontal,
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepServiceType({ value, onChange, onNext, onBack }: Props) {
  const { t: full } = useLang();
  const t = full.onboarding.serviceType;
  const [error, setError] = useState('');

  const handleNext = () => {
    if (!value) {
      setError(t.error);
      return;
    }
    setError('');
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t.heading}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.sub}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {t.options.map(({ key, label }) => {
          const Icon = ICONS[key] ?? MoreHorizontal;
          return (
            <button
              key={key}
              onClick={() => { onChange(key); setError(''); }}
              className={clsx(
                'flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all',
                value === key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50'
              )}
            >
              <Icon size={22} />
              <span className="text-center leading-tight">{label}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} size="lg" className="flex-1">{t.back}</Button>
        <Button onClick={handleNext} size="lg" className="flex-1">{t.next}</Button>
      </div>
    </div>
  );
}
