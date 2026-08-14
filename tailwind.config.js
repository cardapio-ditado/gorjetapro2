/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        gold: {
          300: '#fcd980',
          400: '#f5c14b',
          500: '#e8a921',
          600: '#c98a12',
        },
        night: {
          950: '#08080d',
          900: '#0d0d15',
          850: '#12121c',
          800: '#181824',
          700: '#232334',
        },
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.6s ease-out both',
        glow: 'glow 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
