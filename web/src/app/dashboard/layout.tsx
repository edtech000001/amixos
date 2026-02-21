'use client';

import { AppProvider } from '@/lib/AppContext';
import { Sidebar } from '@/components/dashboard/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        {/* Mobile top padding */}
        <main className="flex-1 min-w-0 pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </AppProvider>
  );
}
