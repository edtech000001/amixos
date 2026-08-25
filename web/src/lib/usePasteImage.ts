import { useEffect } from 'react';

/**
 * Ctrl/Cmd+V uploads an image copied from anywhere (a chat, an email, a
 * screenshot) — the desktop counterpart of the mobile "Paste copied photo"
 * row, so nobody has to save the file to disk first.
 *
 * Listens on `window` so the user doesn't have to focus anything in
 * particular, but stays out of the way of real text pasting: a paste aimed at
 * an input/textarea/contenteditable is ignored.
 *
 * @param enabled  false unplugs the listener (modal closed, read-only role…).
 * @param onImages called with the pasted image files, newest paste only.
 *                 Re-subscribe cost is nil, but the callback IS captured — pass
 *                 deps that change whenever the callback's closure goes stale.
 * @param deps     extra dependencies the callback closes over.
 */
export function usePasteImage(
  enabled: boolean,
  onImages: (files: File[]) => void,
  deps: unknown[] = [],
) {
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (ev: ClipboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const images = Array.from(ev.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
      if (!images.length) return;
      ev.preventDefault();
      onImages(images);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}
