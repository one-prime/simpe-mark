import { defineConfig } from 'tsdown';

// The published `simple-mark` package: one entry per subpath. The workspace packages
// (@simplemark/*) are bundled in; everything in `dependencies` stays external.
export default defineConfig({
  entry: {
    model: '../model/src/index.ts',
    math: '../math/src/index.ts',
    codemirror: '../codemirror/src/index.ts',
  },
  format: 'esm',
  platform: 'neutral',
  outDir: 'dist',
  dts: true,
});
