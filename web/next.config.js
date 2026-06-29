/** @type {import('next').NextConfig} */
const nextConfig = {
  // App version (from package.json) exposed to the client so the sidebar footer
  // can show a build identifier. The commit SHA comes from Vercel's
  // auto-injected NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA at deploy time.
  env: {
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
  },
  // Workspace + the RN ecosystem all need transpilation through next-swc-loader
  // because the source ships untranspiled Flow / RN-specific JSX.
  transpilePackages: [
    '@amixos/shared',
    'react-native',
    'react-native-web',
    'react-native-svg',
    'react-native-reanimated',
    'react-native-gesture-handler',
    'react-native-safe-area-context',
    'react-native-screens',
    '@react-native/assets-registry',
    '@react-native/normalize-colors',
    'lucide-react-native',
    'expo',
    'expo-modules-core',
    'expo-linking',
    'expo-status-bar',
    'expo-router',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  webpack: (config) => {
    const path = require('path');
    // Universal components import from 'react-native'. On web, alias to
    // 'react-native-web' so View/Text/Pressable render to <div>/<span>/<button>.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'react-native$': 'react-native-web',
      // @react-native/assets-registry ships untranspiled Flow source. On web
      // we don't actually need an asset registry (SVG icons are inline), so
      // stub it out to avoid the Flow parse error.
      '@react-native/assets-registry/registry$': path.resolve(__dirname, 'rn-stubs/assets-registry.js'),
      '@react-native/assets-registry/registry.js$': path.resolve(__dirname, 'rn-stubs/assets-registry.js'),
    };
    // Prefer .web.tsx/.web.ts when present so platform-specific code can
    // ship a web variant. Order matters — web extensions must come first.
    config.resolve.extensions = [
      '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
      ...(config.resolve.extensions ?? []),
    ];
    return config;
  },
};

module.exports = nextConfig;
