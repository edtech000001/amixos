// Shared Tailwind preset — single source of truth for design tokens.
// Used by web/tailwind.config.ts and mobile/tailwind.config.js.

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          dark: '#3730A3',
          light: '#818CF8',
        },
        accent: {
          DEFAULT: '#10B981',
          dark: '#059669',
        },
        surface: '#F9FAFB',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
};
