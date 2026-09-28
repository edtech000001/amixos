// Terms of service — public, no auth. Linked from both apps' signup screens.
//
// The text itself lives in shared/src/legal/terms.ts so this page and the
// in-app consent gate render the identical document.

import type { Metadata } from 'next';
import { LegalPage } from '../(legal)/LegalPage';
import { termsOfService } from '@amixos/shared/legal/terms';

export const metadata: Metadata = {
  title: 'Términos de Servicio · Amixos',
  description: 'Las reglas para usar Amixos.',
};

export default function TermsPage() {
  return <LegalPage content={termsOfService} />;
}
