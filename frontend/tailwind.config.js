/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        fb: {
          blue: '#1877F2',
          dark: '#0d6efd',
        },
      },
    },
  },
  plugins: [],
};
