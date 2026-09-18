import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Never inline an asset. Vite's 4 KB default inlined one font face (the
    // JetBrains Mono cyrillic-ext subset, 2,028 bytes) as a data: URI, and
    // `font-src 'self'` blocked it on every page load, so that subset never
    // rendered. Keeping fonts external also lets them cache independently of the
    // stylesheet instead of being re-downloaded whenever any CSS changes.
    assetsInlineLimit: 0,
  },
});
