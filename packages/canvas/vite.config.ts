import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Demo: the editor and the canvas side by side. Images come from the editor demo's images folder.
export default defineConfig({
  publicDir: fileURLToPath(new URL('../codemirror/demo/images', import.meta.url)),
  // MathJax font parts are imported on demand; prepare them at startup (see codemirror's config).
  optimizeDeps: {
    include: readdirSync(new URL('../../node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic', import.meta.url))
      .filter((file) => file.endsWith('.js'))
      .map((file) => `@mathjax/mathjax-newcm-font/js/svg/dynamic/${file}`),
  },
});
