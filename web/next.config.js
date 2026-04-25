/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages and the React Native source tree need transpilation.
  transpilePackages: ['@amixos/shared', 'react-native', 'react-native-web'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  webpack: (config) => {
    // Universal components import from 'react-native'. On web, alias to
    // 'react-native-web' so View/Text/Pressable render to <div>/<span>/<button>.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'react-native$': 'react-native-web',
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
