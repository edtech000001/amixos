// In-app confirm/alert bus (web) — replaces native window.confirm / window.alert
// with a styled modal. A single <ConfirmHost> (mounted in the dashboard layout)
// registers a handler; anywhere in the app — pages OR shared web screens — can
// call confirm()/alertMessage() imperatively and await the result.
//
// If no host is mounted (e.g. a page outside the dashboard), it falls back to
// the native dialog so nothing breaks.

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button for deletes / irreversible actions. */
  destructive?: boolean;
}

export type ConfirmRequest = ConfirmOptions & { kind: 'confirm' | 'alert' };
type Handler = (req: ConfirmRequest) => Promise<boolean>;

let handler: Handler | null = null;

export function registerConfirmHost(fn: Handler): () => void {
  handler = fn;
  return () => { if (handler === fn) handler = null; };
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (handler) return handler({ ...opts, kind: 'confirm' });
  if (typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(opts.title ? `${opts.title}\n\n${opts.message}` : opts.message));
  }
  return Promise.resolve(false);
}

export function alertMessage(opts: ConfirmOptions): Promise<void> {
  if (handler) return handler({ ...opts, kind: 'alert' }).then(() => undefined);
  if (typeof window !== 'undefined') {
    window.alert(opts.title ? `${opts.title}\n\n${opts.message}` : opts.message);
  }
  return Promise.resolve();
}
