'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/i18n/LangProvider';

/**
 * "You can also paste a copied photo with ⌘V" — the discoverability line for
 * the paste-an-image support (see `usePasteImage`). Without it the shortcut is
 * invisible: nothing on screen suggests Ctrl+V does anything.
 *
 * The modifier is resolved on the client only. Reading `navigator` during
 * render would mismatch the server-rendered HTML, so it starts as the Ctrl
 * label and corrects itself in an effect — a swap nobody notices on a hint.
 */
export function PasteHint({ className = '' }: { className?: string }) {
  const { t } = useLang();
  const [keys, setKeys] = useState('Ctrl+V');

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      '';
    if (/mac|iphone|ipad|ipod/i.test(platform)) setKeys('⌘V');
  }, []);

  // A <span>, not a <p>: this drops inside <button> and <label> dropzones,
  // where flow content like <p> is invalid nesting and React warns.
  return (
    <span className={`block text-xs text-faint ${className}`}>
      {t.common.pasteImageHint.replace('{{keys}}', keys)}
    </span>
  );
}
