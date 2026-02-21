'use client';
import { Calendar } from 'lucide-react';
export default function CalendarioPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Calendario</h1>
      <div className="mt-20 text-center text-gray-400">
        <Calendar size={48} className="mx-auto mb-4 opacity-30"/>
        <p className="text-sm font-medium">Próximamente</p>
        <p className="text-xs mt-1">Aquí podrás ver y agendar trabajos, entregas y eventos.</p>
      </div>
    </div>
  );
}
