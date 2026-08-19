/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans:    ['DM Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      // Escala tipografica — espelha o bloco de :root em src/index.css.
      // Piso de 11px (caption). Um papel por degrau; nao crave pixel.
      fontSize: {
        caption: ['0.6875rem', { lineHeight: '1.35' }], // 11px
        label:   ['0.75rem',   { lineHeight: '1.35' }], // 12px
        body:    ['0.875rem',  { lineHeight: '1.55' }], // 14px
        subsec:  ['1rem',      { lineHeight: '1.35' }], // 16px
        section: ['1.25rem',   { lineHeight: '1.15' }], // 20px
        title:   ['1.75rem',   { lineHeight: '1.15' }], // 28px
        display: ['2.5rem',    { lineHeight: '1.15' }], // 40px
      },
      colors: {
        wine: {
          DEFAULT: '#7D1F2C',
          deep:    '#5C1520',
          deepest: '#3d0e16',
          light:   '#9B2535',
          glow:    'rgba(125, 31, 44, 0.18)',
        },
        gold: {
          DEFAULT: '#D4AF37',
          light:   '#E5C158',
          muted:   'rgba(212, 175, 55, 0.14)',
        },
        dark: {
          base:     '#080c14',
          DEFAULT:  '#0c1018',
          card:     '#101520',
          elevated: '#141a28',
          surface:  '#1a2235',
        },
        // Regra de uso e razoes de contraste medidas: ver bloco Text em src/index.css.
        // Resumo: muted (1,99:1) e disabled (1,40:1) REPROVAM como texto — use-os so em
        // icone decorativo, divisoria e estado desabilitado. Texto legivel para em secondary.
        text: {
          primary:   '#e8edf8',
          secondary: '#7a8ba6',
          muted:     '#3a4560',
          disabled:  '#252e3f',
        },
        success: { DEFAULT: '#10b981', light: '#34d399', dim: 'rgba(16,185,129,0.12)' },
        warning: { DEFAULT: '#f59e0b', light: '#fbbf24', dim: 'rgba(245,158,11,0.12)' },
        danger:  { DEFAULT: '#ef4444', light: '#f87171', dim: 'rgba(239,68,68,0.12)'  },
        info:    { DEFAULT: '#3b82f6', light: '#93c5fd', dim: 'rgba(59,130,246,0.12)' },
        gray: {
          50:  '#f0f4ff',
          100: '#dde4f0',
          200: '#bac4d8',
          300: '#92a0b8',
          400: '#6b7d98',
          500: '#4a5878',
          600: '#323d57',
          700: '#1e2840',
          800: '#131c30',
          900: '#0c1220',
          950: '#070b17',
        },
      },
      boxShadow: {
        'wine-sm': '0 1px 3px rgba(125,31,44,0.15)',
        'wine':    '0 2px 8px rgba(125,31,44,0.25)',
        'wine-lg': '0 4px 20px rgba(125,31,44,0.35)',
        'dark-sm': '0 1px 3px rgba(0,0,0,0.3)',
        'dark':    '0 4px 16px rgba(0,0,0,0.4)',
        'dark-lg': '0 8px 32px rgba(0,0,0,0.5)',
        'dark-xl': '0 20px 60px rgba(0,0,0,0.6)',
        'inner-top': 'inset 0 1px 0 rgba(255,255,255,0.06)',
        sm:  '0 1px 4px rgba(0,0,0,0.25)',
        DEFAULT: '0 2px 8px rgba(0,0,0,0.35)',
        md:  '0 4px 16px rgba(0,0,0,0.4)',
        lg:  '0 8px 32px rgba(0,0,0,0.45)',
        xl:  '0 16px 48px rgba(0,0,0,0.55)',
      },
      borderRadius: {
        lg:    '12px',
        xl:    '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      spacing: {
        '13': '3.25rem',
        '18': '4.5rem',
        '88': '22rem',
        '104':'26rem',
      },
    },
  },
  plugins: [],
}
