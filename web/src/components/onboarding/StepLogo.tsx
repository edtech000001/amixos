'use client';

import { useRef, useState } from 'react';
import { ImageIcon, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { createSupabaseClient } from '@/lib/supabase';

interface Props {
  logoUrl: string | null;
  onChange: (url: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepLogo({ logoUrl, onChange, onNext, onBack }: Props) {
  const supabase = createSupabaseClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be under 2MB');
      return;
    }

    setUploading(true);
    setError('');

    const ext = file.name.split('.').pop();
    const path = `logos/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('business-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError('Upload failed. Try again.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('business-assets').getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <ImageIcon className="text-primary" size={24} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Sube tu logo</h2>
        <p className="text-sm text-gray-500 mt-1">Opcional — puedes agregarlo después en ajustes.</p>
      </div>

      <div
        onClick={() => !logoUrl && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
          logoUrl ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-primary/40 hover:bg-primary/5'
        }`}
      >
        {logoUrl ? (
          <>
            <img src={logoUrl} alt="Logo preview" className="h-20 object-contain rounded-xl" />
            <button
              onClick={e => { e.stopPropagation(); onChange(null); }}
              className="text-xs text-red-400 flex items-center gap-1 hover:text-red-500"
            >
              <X size={12} /> Remove
            </button>
          </>
        ) : (
          <>
            <Upload size={28} className="text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Toca para subir tu logo</p>
              <p className="text-xs text-gray-400">PNG, JPG hasta 2MB</p>
            </div>
          </>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} size="lg" className="flex-1">Atrás</Button>
        <Button onClick={onNext} loading={uploading} size="lg" className="flex-1">
          {logoUrl ? 'Continuar' : 'Saltar por ahora'}
        </Button>
      </div>
    </div>
  );
}
