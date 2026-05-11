/**
 * PostCSS configuration.
 *
 * Required for Tailwind to compile during Vite builds and for Autoprefixer
 * to add vendor prefixes for the Chromium versions Electron ships.
 */

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
