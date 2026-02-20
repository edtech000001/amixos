'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}

export function StepBusinessName({ value, onChange, onNext }: Props) {
  const [error, setError] = useState('');

  const handleNext = () => {
    if (!value.trim()) {
      setError('El nombre del negocio es requerido');
      return;
    }
    setError('');
    onNext();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <Building2 className="text-primary" size={24} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">¿Cómo se llama tu negocio?</h2>
        <p className="text-sm text-gray-500 mt-1">Puedes cambiarlo después cuando quieras.</p>
      </div>

      <Input
        label="Business Name"
        placeholder="ej. Champion Built"
        value={value}
        onChange={e => onChange(e.target.value)}
        error={error}
        onKeyDown={e => e.key === 'Enter' && handleNext()}
        autoFocus
      />

      <Button onClick={handleNext} fullWidth size="lg">
        Continuar
      </Button>
    </div>
  );
}
