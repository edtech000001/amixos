// Expo prefers app.config.js over app.json when both exist. We use this
// thin wrapper to inject env-driven values (Google Maps API key) into the
// native iOS/Android config blocks at build time — app.json itself can't
// reference process.env.
//
// Everything else still lives in app.json; we just spread it and add the
// fields that need env interpolation.
const base = require('./app.json').expo;

module.exports = () => ({
  ...base,
  // NO ios.config.googleMapsApiKey. modules/map/MapScreen.tsx passes no
  // `provider` prop, so react-native-maps uses the platform default — Apple
  // Maps on iOS. The key was being injected into the iOS binary and never
  // read: a published credential buying nothing. (An older comment here
  // claimed iOS used PROVIDER_GOOGLE; the map code says otherwise, and the
  // code wins.) If iOS ever switches to Google Maps it needs its OWN key —
  // Google allows one application-restriction type per key, so an
  // Android-restricted key cannot also serve iOS.
  android: {
    ...base.android,
    config: {
      ...(base.android.config ?? {}),
      // Restricted in Google Cloud to Android apps (com.amixos.app + the
      // release SHA-1) AND to Maps SDK for Android only. The name says
      // ANDROID so nobody reuses it for web or server — those have their own
      // keys, and pasting this one there fails in a way that looks like an
      // outage rather than a misconfiguration.
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
});
