import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharedPreset = require('../shared/tailwind-preset.js');

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    '../shared/src/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [sharedPreset],
  plugins: [],
};

export default config;
