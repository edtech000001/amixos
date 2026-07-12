// Native variant of the confirm/alert bus. Web screens use confirmBus.web.ts;
// this base exists so TypeScript resolves the module and any native caller gets
// a working RN Alert. (Only .web.tsx screens consume this today, so on native
// it simply defers to the platform alert.)

import { Alert } from 'react-native';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export type ConfirmRequest = ConfirmOptions & { kind: 'confirm' | 'alert' };
type Handler = (req: ConfirmRequest) => Promise<boolean>;

// No host concept on native — kept for signature parity with the web variant.
export function registerConfirmHost(_fn: Handler): () => void {
  return () => {};
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(opts.title ?? '', opts.message, [
      { text: opts.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: opts.confirmText ?? 'OK', style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

export function alertMessage(opts: ConfirmOptions): Promise<void> {
  return new Promise(resolve => {
    Alert.alert(opts.title ?? '', opts.message, [{ text: opts.confirmText ?? 'OK', onPress: () => resolve() }]);
  });
}
