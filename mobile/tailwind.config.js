const sharedPreset = require('../shared/tailwind-preset.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    '../shared/src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset'), sharedPreset],
};
