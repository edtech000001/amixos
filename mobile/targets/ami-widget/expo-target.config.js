// Ami's during-call Live Activity (lock screen + Dynamic Island) and the
// "Habla con Ami" Siri phrase. Files in _shared/ are compiled into BOTH this
// widget and the main app (the buttons' intents run in the app, and Siri's
// App Shortcuts must live in the app). See plugin: @bacons/apple-targets.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'AmiWidget',
  displayName: 'Ami',
  bundleIdentifier: '.amiwidget',
  // Live Activity buttons (LiveActivityIntent) need iOS 17.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  colors: { $accent: '#2563EB' },
  // Same App Group as the app: the home-screen widgets read the snapshot it writes.
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
