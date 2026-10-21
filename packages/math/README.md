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

MIT. MathJax and its font come with their own licenses (Apache-2.0, as MathJax labels
them); MathJax says the font is based on New Computer Modern, whose fonts are under the GUST
Font License or, for a few, GPL-3.0 with a font exception.
