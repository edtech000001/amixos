import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { renderAmiWidget, type WidgetSnap } from './AmiAndroidWidgets';

/** AsyncStorage keys the app writes (lib/widgetSnapshot.ts) and widgets read:
 *  KEY = business open in the app, `${KEY}.<businessId>` = each business. */
export const ANDROID_WIDGET_KEY = 'amixos_widget_today';
/** [{id, name}] — the businesses a widget can be set to (settings screen). */
export const ANDROID_BUSINESSES_KEY = 'amixos_widget_businesses';
/** Business chosen for one widget instance (its settings screen). */
export const widgetBusinessKey = (widgetId: number) => `amixos_widget_cfg.${widgetId}`;

async function read(key: string): Promise<WidgetSnap | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as WidgetSnap) : null;
  } catch {
    return null;
  }
}

/** The widget's chosen business, else the one last open in the app. */
export async function loadSnapForWidget(widgetId: number): Promise<WidgetSnap | null> {
  const bizId = await AsyncStorage.getItem(widgetBusinessKey(widgetId)).catch(() => null);
  return (bizId ? await read(`${ANDROID_WIDGET_KEY}.${bizId}`) : null) ?? read(ANDROID_WIDGET_KEY);
}

// Headless task Android runs when a widget is added, resized or refreshed.
// Taps use OPEN_URI deep links, so there's nothing to do on WIDGET_CLICK.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_CLICK') return;
  if (props.widgetAction === 'WIDGET_DELETED') {
    await AsyncStorage.removeItem(widgetBusinessKey(props.widgetInfo.widgetId)).catch(() => {});
    return;
  }
  const snap = await loadSnapForWidget(props.widgetInfo.widgetId);
  props.renderWidget(renderAmiWidget(props.widgetInfo.widgetName, snap, props.widgetInfo.width));
}
