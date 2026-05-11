/**
 * VizCloud Design Token System
 * Beautiful dark theme with subtle gradients and animations
 */

export const theme = {
  // Colors - Deep space dark theme
  colors: {
    // Backgrounds
    background: '#0a0a0f',
    page: '#0f0f16',
    sidebar: '#11111a',
    'sidebar-hover': '#1a1a25',
    header: '#0f0f16',
    search: '#161622',
    
    // Borders
    border: '#2a2a3a',
    'border-light': '#3a3a4a',
    
    // Primary Brand
    primary: '#6366f1',
    'primary-light': '#818cf8',
    'primary-dark': '#4f46e5',
    'primary-glow': 'rgba(99, 102, 241, 0.4)',
    
    // Semantic Colors
    success: '#10b981',
    'success-light': '#34d399',
    warning: '#f59e0b',
    'warning-light': '#fbbf24',
    error: '#ef4444',
    'error-light': '#f87171',
    info: '#3b82f6',
    'info-light': '#60a5fa',
    
    // Text
    foreground: '#f3f4f6',
    muted: '#9ca3af',
    'muted-dark': '#6b7280',
    
    // Gradients
    'gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'gradient-success': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'gradient-warning': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    'gradient-error': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  },

  // Spacing
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
  },

  // Typography
  fonts: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Source Code Pro", monospace',
  },

  // Sizes
  sizes: {
    radius: {
      sm: '0.25rem',
      md: '0.5rem',
      lg: '0.75rem',
    xl: '1rem',
      '2xl': '1.5rem',
      full: '9999px',
    },
    shadow: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      glow: '0 0 20px rgba(99, 102, 241, 0.5)',
    },
  },

  // Animation
  animation: {
    duration: {
      fast: '100ms',
      normal: '200ms',
      slow: '300ms',
    },
    timing: {
      default: 'cubic-bezier(0.4, 0, 0.2, 1)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      ease: 'ease-in-out',
    },
  },
};

export type Theme = typeof theme;
