// Privacy policy — public, no auth. Linked from both apps' signup screens and
// used as the privacy-policy URL in App Store Connect.
//
// The text itself lives in shared/src/legal/privacy.ts so this page and the
// in-app consent gate render the identical document. Two copies is how an app
// ends up promising one thing on the web and another in the store listing.

import type { Metadata } from 'next';
import { LegalPage } from '../(legal)/LegalPage';
import { privacyPolicy } from '@amixos/shared/legal/privacy';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad · Amixos',
  description: 'Cómo Amixos recopila, usa y protege tu información.',
};

export default function PrivacyPolicyPage() {
  return <LegalPage content={privacyPolicy} />;
}
