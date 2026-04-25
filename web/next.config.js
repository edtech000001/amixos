/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace package — Next.js needs to transpile its TypeScript sources.
  transpilePackages: ['@amixos/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
