/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        caiyun: {
          light: '#e0f2fe',
          DEFAULT: '#0284c7',
          dark: '#0369a1',
        },
        qweather: {
          light: '#fef3c7',
          DEFAULT: '#f59e0b',
          dark: '#d97706',
        }
      },
      screens: {
        'xs': '375px',
      }
    },
  },
  plugins: [],
}
