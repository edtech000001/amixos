'use client';
import { Package } from 'lucide-react';
export default function InventarioPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Inventario</h1>
      <div className="mt-20 text-center text-gray-400">
        <Package size={48} className="mx-auto mb-4 opacity-30"/>
        <p className="text-sm font-medium">Próximamente</p>
        <p className="text-xs mt-1">Controla materiales, productos y niveles de stock.</p>
      </div>
    </div>
  );
}
