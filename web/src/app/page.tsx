import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 to-emerald-500 text-white px-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-4">Amixos</h1>
        <p className="text-xl mb-2 opacity-90">Donde negocios prospera.</p>
        <p className="text-lg mb-10 opacity-75">
          Administración de negocios hecha para tu equipo. Bilingüe. Simple. Poderoso.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/login"
            className="bg-white text-indigo-600 font-semibold px-6 py-3 rounded-xl hover:bg-gray-100 transition"
          >
            Iniciar
          </Link>
          <Link
            href="/auth/register"
            className="border border-white text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10 transition"
          >
            Empieza Gratis
          </Link>
        </div>
      </div>
    </main>
  );
}
