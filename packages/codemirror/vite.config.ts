import { readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Demo server. POST /debug-report (sent by the demo's ?debug mode) is saved to
// <tmp>/simple-mark-debug-report.json, so a run in a real browser can be studied.
export default defineConfig({
  // The repository folder, for the demo's paths starting with "/" (see main.ts).
  define: { __REPO_ROOT__: JSON.stringify(fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')) },
  // MathJax font parts are imported on demand; prepare them at startup, so the dev server
  // never discovers them mid-session and serves a page an outdated chunk (504).
  optimizeDeps: {
    include: readdirSync(new URL('../../node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic', import.meta.url))
      .filter((file) => file.endsWith('.js'))
      .map((file) => `@mathjax/mathjax-newcm-font/js/svg/dynamic/${file}`),
  },
  plugins: [
    {
      name: 'simple-mark-debug-report',
      configureServer(server) {
        server.middlewares.use('/debug-report', (req, res) => {
          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk.toString()));
          req.on('end', () => {
            const file = join(tmpdir(), 'simple-mark-debug-report.json');
            writeFileSync(file, body);
            res.end(`saved to ${file}`);
          });
        });
      },
    },
  ],
});
