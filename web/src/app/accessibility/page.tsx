// Accessibility statement — public, no auth. Linked from the landing footer
// and Settings → Support in both apps.

import type { Metadata } from 'next';
import { LegalPage } from '../(legal)/LegalPage';
import { accessibilityStatement } from '@amixos/shared/legal/accessibility';

export const metadata: Metadata = {
  title: 'Accesibilidad · Amixos',
  description: 'Cómo hacemos Amixos accesible y cómo reportar un problema.',
};

export default function AccessibilityPage() {
  return <LegalPage content={accessibilityStatement} />;
}
