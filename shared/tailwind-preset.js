// Shared Tailwind preset — single source of truth for design tokens.
// Used by web/tailwind.config.ts and mobile/tailwind.config.js.
//
// Colors are semantic tokens backed by CSS variables (defined per-platform in
// web/src/app/globals.css and mobile/global.css for :root / .dark). Channel-
// triplet form so Tailwind's `/opacity` still works (bg-primary/10). Screens
// use the semantic names (bg-card, text-ink, border-border, text-muted, …) so
// light↔dark is a single class instead of hardcoded grays.

const withVar = (v) => `rgb(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand — vivid blue (replaces the old indigo/violet "AI default").
        primary: {
          DEFAULT: withVar('--color-primary'),
          dark: withVar('--color-primary-dark'),
          light: withVar('--color-primary-light'),
        },
        accent: {
          DEFAULT: '#10B981',
          dark: '#059669',
        },
        surface: withVar('--color-surface'),   // page background
        card: withVar('--color-card'),          // card / panel background
        elevated: withVar('--color-elevated'),  // popovers, modals, dropdowns
        border: withVar('--color-border'),      // default borders
        'border-soft': withVar('--color-border-soft'), // hairline dividers
        ink: withVar('--color-ink'),            // primary text / headings
        muted: withVar('--color-muted'),        // secondary text
        faint: withVar('--color-faint'),        // tertiary text / placeholders
        success: withVar('--color-success'),
        danger: withVar('--color-danger'),
        warning: withVar('--color-warning'),
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
};
