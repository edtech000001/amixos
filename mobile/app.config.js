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
  ios: {
    ...base.ios,
    config: {
      ...base.ios.config,
      // The Map module uses PROVIDER_GOOGLE on iOS for consistent UX with
      // Android + web. react-native-maps reads this at native init time.
      // If unset, iOS falls back to Apple Maps (still works, different look).
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
  },
  android: {
    ...base.android,
    config: {
      ...(base.android.config ?? {}),
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
});
