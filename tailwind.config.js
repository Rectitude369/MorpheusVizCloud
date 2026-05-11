/**
 * Tailwind CSS configuration.
 *
 * Design tokens are sourced from CSS variables declared in
 * `src/renderer/styles/globals.css`. This means runtime theme switching
 * works without rebuilding (REFACTOR-009): swap the variables on `:root`
 * and Tailwind's existing utility classes pick up the new values.
 *
 * Color values use the `<alpha-value>` placeholder pattern so opacity
 * modifiers (`bg-success/10`, `text-error/60`) work correctly with
 * CSS variables.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--bg-background-rgb) / <alpha-value>)',
        page:       'rgb(var(--bg-page-rgb) / <alpha-value>)',
        sidebar:    'rgb(var(--bg-sidebar-rgb) / <alpha-value>)',
        'sidebar-hover': 'rgb(var(--bg-sidebar-hover-rgb) / <alpha-value>)',
        header:     'rgb(var(--bg-header-rgb) / <alpha-value>)',
        search:     'rgb(var(--bg-search-rgb) / <alpha-value>)',

        border:        'rgb(var(--border-default-rgb) / <alpha-value>)',
        'border-light':'rgb(var(--border-light-rgb) / <alpha-value>)',

        primary:        'rgb(var(--color-primary-rgb) / <alpha-value>)',
        'primary-light':'rgb(var(--color-primary-light-rgb) / <alpha-value>)',
        'primary-dark': 'rgb(var(--color-primary-dark-rgb) / <alpha-value>)',

        success:        'rgb(var(--color-success-rgb) / <alpha-value>)',
        'success-light':'rgb(var(--color-success-light-rgb) / <alpha-value>)',
        warning:        'rgb(var(--color-warning-rgb) / <alpha-value>)',
        'warning-light':'rgb(var(--color-warning-light-rgb) / <alpha-value>)',
        error:          'rgb(var(--color-error-rgb) / <alpha-value>)',
        'error-light':  'rgb(var(--color-error-light-rgb) / <alpha-value>)',
        info:           'rgb(var(--color-info-rgb) / <alpha-value>)',
        'info-light':   'rgb(var(--color-info-light-rgb) / <alpha-value>)',

        foreground:    'rgb(var(--color-foreground-rgb) / <alpha-value>)',
        muted:         'rgb(var(--color-muted-rgb) / <alpha-value>)',
        'muted-dark':  'rgb(var(--color-muted-dark-rgb) / <alpha-value>)',

        // Aliases retained for shadcn-style components
        destructive: 'rgb(var(--color-error-rgb) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--color-foreground-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Source Code Pro"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(99, 102, 241, 0.5)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)' },
          '50%':      { boxShadow: '0 0 30px rgba(99, 102, 241, 0.4)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
