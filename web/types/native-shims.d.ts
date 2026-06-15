// Type shims for native-only packages imported by SHARED screens.
//
// Shared screens (shared/src/screens/**) ship a native `.tsx` and, where the
// implementation differs, a web `.web.tsx`. At runtime the web build resolves
// the `.web.tsx` (next.config.js sets webpack resolve.extensions to prefer
// `.web`), so native-only modules never reach the web bundle. But `tsc`
// (run by `next build`'s type-check) has no `.web` preference and type-checks
// the native `.tsx` too — which on Vercel can't resolve native-only packages
// that aren't installed in the web workspace. These ambient declarations let
// the type-check resolve them as `any`; the real types are used in the mobile
// app, which installs the real packages.

declare module '@react-native-async-storage/async-storage';
