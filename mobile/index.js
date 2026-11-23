// App entry: Expo Router, plus the Android home-screen widget task (it must be
// registered at startup so Android can render widgets without opening the app).
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler, registerWidgetConfigurationScreen } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./widgets/widgetTaskHandler');
  const { WidgetBusinessPicker } = require('./widgets/WidgetBusinessPicker');
  registerWidgetTaskHandler(widgetTaskHandler);
  // "Edit widget" → pick which business it shows (optional on add).
  registerWidgetConfigurationScreen(WidgetBusinessPicker);
}
