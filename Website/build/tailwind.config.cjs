/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    '../index.html',
    '../privacy-policy.html',
    '../assets/js/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
