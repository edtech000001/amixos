'use client';

import { CheckCircle2 } from 'lucide-react';
import { useEffect } from 'react';

export function StepComplete() {
  useEffect(() => {
    const t = setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
        <CheckCircle2 className="text-accent" size={36} />
      </div>
      <h2 className="text-xl font-bold text-gray-900">¡Todo listo!</h2>
      <p className="text-sm text-gray-500">Preparando tu panel...</p>
      <div className="flex gap-1 mt-2">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
