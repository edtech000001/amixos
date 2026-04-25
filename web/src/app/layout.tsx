import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LangProvider } from '@/i18n/LangProvider';
import { getServerLocale } from '@/i18n/getServerLocale';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Amixos — Donde se hace la chamba.',
  description: 'Plataforma de gestión para pequeños negocios. Bilingüe. Modular. Hecha para la comunidad.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getServerLocale();
  return (
    <html lang={locale}>
      <body className={inter.className}>
        <LangProvider initialLocale={locale}>{children}</LangProvider>
      </body>
    </html>
  );
}
