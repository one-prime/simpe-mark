# @simple-mark/math

TeX to a self-contained SVG string with MathJax 4, for
[SimpleMark](https://github.com/one-prime/simple-mark). No DOM needed (works in Node), no
fonts to load (glyphs are paths), so the SVG can go into HTML, onto a canvas or into a file.

```ts
import { renderMath, cachedMath } from '@simple-mark/math';

const { svg, error } = await renderMath('\\sum_{k=1}^n k = \\frac{n(n+1)}{2}', true);
```

- Errors come back as text (`{ error: 'Missing close brace' }`), never as broken output.
- Rarely used glyph ranges load on demand; bundlers make each a separate chunk.
- TeX packages that create links or HTML (`\href`, `\style`, raw HTML) and packages that
  load code are not included, so documents from anyone are safe to render.

- Formulas are drawn with MathJax's Latin Modern font (`@mathjax/mathjax-modern-font`).
  MathJax's SVG output still imports its default font (New Computer Modern, whose license in
  MathJax's version is unclear) through `#default-font/*`; when you bundle this package,
  alias that import to Latin Modern so it stays out:

  ```ts
  // vite.config.ts
  resolve: { alias: [{ find: /^#default-font\/(.*)$/, replacement: '@mathjax/mathjax-modern-font/mjs/$1' }] },
  ```

MIT. MathJax and its font come with their own licenses (Apache-2.0, as MathJax labels them);
the font is a version of Latin Modern, under the GUST Font License.
