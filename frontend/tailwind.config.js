/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          deep:    '#0A1322',
          DEFAULT: '#0E1A2E',
          surface: '#16243B',
        },
        gold: {
          DEFAULT: '#C9A347',
          bright:  '#E6BF55',
          soft:    '#F4ECD8',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        400: '400',
        500: '500',
        600: '600',
        700: '700',
        800: '800',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: '0.55', transform: 'translateX(-50%) scale(1)' },
          '50%':       { opacity: '0.8',  transform: 'translateX(-50%) scale(1.05)' },
        },
      },
      animation: {
        glow: 'glow 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
