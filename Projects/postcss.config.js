// Tailwind is compiled by @tailwindcss/vite in vite.config.js. Keeping a
// second PostCSS plugin here makes Vite's dev server resolve the plugin from
// the nested Kaneo install, which is not guaranteed to contain a complete
// package tree in the monorepo. An empty config preserves PostCSS discovery
// for future plugins without making local CSS requests fail with HTTP 500.
export default {
  plugins: {},
};
