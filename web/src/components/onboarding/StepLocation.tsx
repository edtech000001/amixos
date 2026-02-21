'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
  'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
];

interface Props {
  city: string;
  state: string;
  onChange: (fields: { city?: string; state?: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepLocation({ city, state, onChange, onNext, onBack }: Props) {
  const [error, setError] = useState('');

  const handleNext = () => {
    if (!city.trim() || !state.trim()) {
      setError('Ciudad y estado son requeridos');
      return;
    }
    setError('');
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <MapPin className="text-primary" size={24} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">¿Dónde está tu negocio?</h2>
        <p className="text-sm text-gray-500 mt-1">Ayuda con horarios locales y manejo de clientes.</p>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          label="Ciudad"
          placeholder="ej. Los Ángeles"
          value={city}
          onChange={e => onChange({ city: e.target.value })}
          autoFocus
        />

        {/* State dropdown */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Estado</label>
          <select
            value={state}
            onChange={e => onChange({ state: e.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition duration-150 appearance-none"
          >
            <option value="">Selecciona un estado</option>
            {US_STATES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} size="lg" className="flex-1">Atrás</Button>
        <Button onClick={handleNext} size="lg" className="flex-1">Continuar</Button>
      </div>
    </div>
  );
}
