import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { renderAmiWidget, type WidgetSnap } from './AmiAndroidWidgets';

/** AsyncStorage key the app writes (lib/widgetSnapshot.ts) and widgets read. */
export const ANDROID_WIDGET_KEY = 'amixos_widget_today';

export async function loadWidgetSnap(): Promise<WidgetSnap | null> {
  try {
    const raw = await AsyncStorage.getItem(ANDROID_WIDGET_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnap) : null;
  } catch {
    return null;
  }
}

// Headless task Android runs when a widget is added, resized or refreshed.
// Taps use OPEN_URI deep links, so there's nothing to do on WIDGET_CLICK.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  const snap = await loadWidgetSnap();
  props.renderWidget(renderAmiWidget(props.widgetInfo.widgetName, snap, props.widgetInfo.width));
}
