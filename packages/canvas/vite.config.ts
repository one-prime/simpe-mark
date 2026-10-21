import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { fontAlias, fontParts } from '../../scripts/mathjax-font.mjs';

// Demo: the editor and the canvas side by side. Images come from the editor demo's images folder.
export default defineConfig({
  publicDir: fileURLToPath(new URL('../codemirror/demo/images', import.meta.url)),
  // MathJax font parts are imported on demand; prepare them at startup (see codemirror's config).
  optimizeDeps: {
    include: fontParts(),
  },
  resolve: { alias: [fontAlias] },
});
