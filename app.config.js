// Guard: this file exists ONLY to make `expo` / `eas` fail loudly when invoked
// from the repo root. The real Expo project lives in `mobile/` and has its own
// `app.json`. Running Expo from the root silently creates stub configs
// (`.expo/`, `tsconfig.json`) and breaks Metro bundling — this prevents that.
throw new Error(
  '\n\n[amixos] Do NOT run `expo` or `eas` from the repo root.\n' +
    '  Run one of:\n' +
    '    cd mobile && npx expo start --tunnel\n' +
    '    cd mobile && eas build --profile development --platform ios\n' +
    '    npm run dev:mobile   (from the repo root — handles the cd for you)\n'
);
