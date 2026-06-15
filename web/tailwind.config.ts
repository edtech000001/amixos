import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharedPreset = require('../shared/tailwind-preset.js');

const config: Config = {
  content: [
    // Scan ALL of src — not just app/components/pages. `src/modules/**`
    // (map, equipment, files) was previously unscanned, so classes used only
    // there (e.g. the pin picker's grid-cols-8/9/5) were never generated and
    // its grids collapsed into a single column. A single src glob avoids
    // re-introducing that gap whenever a new top-level src dir is added.
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../shared/src/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [sharedPreset],
  plugins: [],
};

export default config;
