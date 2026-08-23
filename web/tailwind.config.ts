import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharedPreset = require('../shared/tailwind-preset.js');

// darkMode + semantic color tokens now live in the shared preset so web and
// mobile stay in sync. The CSS variables they reference are defined in
// src/app/globals.css (:root / .dark).
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
  theme: {
    extend: {
      // Hover tooltips (shared/src/ui/Tooltip.web.tsx). Web-only, so it lives
      // here rather than in the shared preset — NativeWind has no use for a
      // keyframe that can never render. Deliberately short: the user has
      // already waited out the hover delay, so anything slower reads as lag.
      keyframes: {
        tooltipIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        tooltipIn: 'tooltipIn 120ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
