import { defineConfig } from 'vite';

// The webview bundle: dist/webview/webview.js plus chunks it imports on demand (MathJax and its
// font parts). Relative chunk URLs resolve against webview.js, which is a webview resource URI.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    target: 'es2022',
    // The preload helper adds <link> tags at run time; not needed in a webview.
    modulePreload: false,
    // MathJax and its font parts are large but load only when a document has math.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      input: 'src/webview/main.ts',
      output: {
        format: 'es',
        entryFileNames: 'webview.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
});
