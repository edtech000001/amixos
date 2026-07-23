// Base URL of the web app, for links the mobile app hands off to the browser
// (public estimate/invoice pages, print views, web billing). Prefers
// EXPO_PUBLIC_WEB_URL (set per environment in mobile/.env — requires a Metro
// restart to pick up changes); falls back to production so these links still
// work when the env var is missing instead of silently producing
// "undefined/..." URLs.
export const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://amixos.com').replace(/\/+$/, '');
