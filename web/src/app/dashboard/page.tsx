'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Top Nav */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary">Amixos</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-red-500 hover:text-red-600 font-medium"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            ¡Bienvenido! 👋
          </h2>
          <p className="text-gray-500 mt-1">Tu panel está en construcción. Vuelve pronto.</p>
        </div>

        {/* Placeholder widgets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: 'Ganancias del mes', value: '$0', color: 'text-accent' },
            { label: 'Facturas activas', value: '0', color: 'text-primary' },
            { label: 'Empleados', value: '0', color: 'text-gray-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-sm text-gray-500 mb-2">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center text-gray-400 text-sm py-16">
          🚧 Dashboard completo — próximamente
        </div>
      </main>
    </div>
  );
}
