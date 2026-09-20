// Mobile-only packages, declared so the WEB type-check can resolve them.
//
// `next build` type-checks every file it can reach through imports, and that
// includes the native (.tsx) variants of shared screens — TypeScript has no
// concept of the bundler's .web.tsx resolution, so it follows the native file
// and then its `react-native-sortables` / reanimated / AsyncStorage imports.
// Those live in mobile/package.json, which Vercel does not install for the web
// build, so the deploy failed with "Cannot find module" (every production
// deploy from 2026-09-02 on — the commit that first imported a sortable list
// into shared/).
//
// Declaring them as `any` HERE only affects the web pass. The web bundle never
// contains these modules (it resolves the .web.tsx variants), and mobile's own
// tsc still checks the native files against the packages' real types.
declare module 'react-native-sortables';
declare module 'react-native-reanimated';
declare module '@react-native-async-storage/async-storage';
