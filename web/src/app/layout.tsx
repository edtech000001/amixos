import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LangProvider } from '@/i18n/LangProvider';
import { getServerLocale } from '@/i18n/getServerLocale';
import { dictionaries } from '@amixos/shared';
import { MobileAppBanner } from '@/components/MobileAppBanner';
import { ThemeProvider, NO_FLASH_SCRIPT } from '@/lib/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export function generateMetadata(): Metadata {
  const locale = getServerLocale();
  const m = dictionaries[locale].common.appMetadata;
  return { title: m.title, description: m.description };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getServerLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint so there's no light→dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <LangProvider initialLocale={locale}>
            <MobileAppBanner />
            {children}
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
