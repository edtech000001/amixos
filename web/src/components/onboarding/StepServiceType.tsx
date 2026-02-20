'use client';

import { useState } from 'react';
import { Wrench, HardHat, Scissors, Utensils, Home, Phone, Car, ShoppingBag, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { clsx } from 'clsx';

const SERVICE_TYPES = [
  { key: 'construction', label: 'Construction', icon: HardHat },
  { key: 'mechanics', label: 'Mechanic / Auto', icon: Wrench },
  { key: 'landscaping', label: 'Landscaping', icon: Home },
  { key: 'cleaning', label: 'Cleaning', icon: Scissors },
  { key: 'restaurant', label: 'Restaurant / Food', icon: Utensils },
  { key: 'phone_repair', label: 'Phone Repair', icon: Phone },
  { key: 'car_dealership', label: 'Car Dealership', icon: Car },
  { key: 'retail', label: 'Retail / Shop', icon: ShoppingBag },
  { key: 'other', label: 'Other', icon: MoreHorizontal },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepServiceType({ value, onChange, onNext, onBack }: Props) {
  const [error, setError] = useState('');

  const handleNext = () => {
    if (!value) {
      setError('Por favor selecciona un tipo de negocio');
      return;
    }
    setError('');
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">¿Qué tipo de negocio es este?</h2>
        <p className="text-sm text-gray-500 mt-1">Activaremos las funciones correctas para tu industria.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {SERVICE_TYPES.map(({ key, label, icon: Icon }) => (
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
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} size="lg" className="flex-1">Atrás</Button>
        <Button onClick={handleNext} size="lg" className="flex-1">Continuar</Button>
      </div>
    </div>
  );
}
