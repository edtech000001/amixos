'use client';

import { Package, Phone, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { clsx } from 'clsx';

interface Props {
  needsInventory: boolean;
  needsVirtualNumber: boolean;
  onChange: (fields: { needsInventory?: boolean; needsVirtualNumber?: boolean }) => void;
  onFinish: () => void;
  onBack: () => void;
  loading: boolean;
  error?: string;
}

const addOns = [
  {
    key: 'needsInventory' as const,
    icon: Package,
    title: 'Sistema de Inventario',
    description: 'Controla productos, materiales y niveles de stock. Recibe alertas cuando te estés quedando sin algo.',
    note: 'Se puede activar después en ajustes',
  },
  {
    key: 'needsVirtualNumber' as const,
    icon: Phone,
    title: 'Número Virtual de Negocio',
    description: 'Obtén un número dedicado para llamadas y mensajes. Mantén lo personal separado del trabajo.',
    note: 'Se puede agregar después en ajustes',
  },
];

export function StepAddOns({ needsInventory, needsVirtualNumber, onChange, onFinish, onBack, loading, error }: Props) {
  const values = { needsInventory, needsVirtualNumber };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">¿Extras para tu negocio?</h2>
        <p className="text-sm text-gray-500 mt-1">Selecciona lo que aplica — ambos son opcionales y gratis.</p>
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
        <Button variant="secondary" onClick={onBack} size="lg" className="flex-1">Atrás</Button>
        <Button onClick={onFinish} loading={loading} size="lg" className="flex-1">
          Crear mi negocio 🚀
        </Button>
      </div>
    </div>
  );
}
