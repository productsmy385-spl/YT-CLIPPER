import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        palette: {
          spruce: '#194350',
          coral: '#ff8882',
          peach: '#ffc2b4',
          seafoam: '#9dbeb8',
          dark: '#0c1b21',
          card: '#132e37',
          border: '#214b57',
        },
        primary: {
          DEFAULT: '#ff8882', // Vibrant Coral Pink from stripe 2
          foreground: '#194350',
          50: '#fff5f4',
          100: '#ffe8e6',
          200: '#ffd5d2',
          300: '#ffb5b0',
          400: '#ff9b94',
          500: '#ff8882',
          600: '#f06c66',
          700: '#d94d47',
        },
        secondary: {
          DEFAULT: '#9dbeb8', // Sage Seafoam from stripe 4
          foreground: '#0c1b21',
          500: '#9dbeb8',
          600: '#84aba4',
        },
        accent: {
          DEFAULT: '#ffc2b4', // Soft Peach from stripe 3
          foreground: '#194350',
          500: '#ffc2b4',
        },
        spruce: {
          DEFAULT: '#194350', // Deep Spruce from stripe 1
          light: '#235766',
          dark: '#0e232a',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        success: '#9dbeb8',
        warning: '#ffc2b4',
        info: '#9dbeb8',
        vice: {
          cyan: '#9dbeb8',
          pink: '#ff8882',
          orange: '#ffc2b4',
          purple: '#194350',
          dark: '#0c1b21',
          card: '#132e37',
          border: '#214b57',
          accent: '#ff8882',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px floor for meta labels & chips
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.35), 0 1px 2px -1px rgb(0 0 0 / 0.25)',
        dropdown: '0 8px 24px -6px rgb(0 0 0 / 0.5), 0 2px 6px -2px rgb(0 0 0 / 0.3)',
        modal: '0 24px 48px -12px rgb(0 0 0 / 0.6)',
        glow: '0 0 25px -4px rgba(255, 136, 130, 0.35)',
        seafoam: '0 0 20px -4px rgba(157, 190, 184, 0.3)',
      },
      fontFamily: {
        sans: ['Sora', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        'fade-in-up': 'fade-in-up 0.4s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        progress: 'progress-fill 1.2s ease-out',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'progress-fill': {
          from: { width: '0%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
