/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0F172A',
          800: '#1E293B',
          700: '#334155',
        },
        gold: {
          DEFAULT: '#F59E0B',
          hover: '#D97706',
        },
      },
    },
  },
  plugins: [],
}

