import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LangProvider } from '@/i18n/LangProvider';
import { getServerLocale } from '@/i18n/getServerLocale';
import { dictionaries } from '@amixos/shared';

const inter = Inter({ subsets: ['latin'] });

export function generateMetadata(): Metadata {
  const locale = getServerLocale();
  const m = dictionaries[locale].common.appMetadata;
  return { title: m.title, description: m.description };
}

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
