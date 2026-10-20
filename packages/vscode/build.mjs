// Bundles the extension host code (Node, CommonJS) into dist/extension.cjs. The webview is
// built by Vite (vite.config.ts), which splits the lazily loaded math renderer into chunks.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  outfile: 'dist/extension.cjs',
  sourcemap: true,
  logLevel: 'info',
});
