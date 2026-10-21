# @simple-mark/canvas

Draws Markdown on a `<canvas>` the way the [SimpleMark](https://github.com/one-prime/simple-mark)
editor shows it: syntax visible and dimmed, headings bigger, code and tables in monospace
(Korean, Chinese and Japanese exactly two columns wide), images and `$$` math below their
lines. For canvas-based apps (diagram and layout tools) that show Markdown text boxes.

```ts
import { createMathImages, layoutMarkdown, paintMarkdown } from '@simple-mark/canvas';

const measure = (text: string, font: string) => ((ctx.font = font), ctx.measureText(text).width);
const math = createMathImages(() => redraw());

const layout = layoutMarkdown('# Room 3\n\n**Locked** until the key is found.', {
  width: 300,                                   // Infinity: keep the text's own lines
  style: { fontFamily: 'sans-serif', fontSize: 16, fontWeight: 400, lineHeight: 1.5, color: '#222' },
  measure,
  imageSize: (src) => sizeOf(src),              // natural size; undefined while loading
  mathSize: (tex, family) => math.size(tex, family),
  highlight,                                    // optional: createHighlighter(() => redraw())
});
paintMarkdown(ctx, layout, { image: (src) => loaded(src), math: (tex, color) => math.image(tex, color) }, '#222');
// layout.width / layout.height: the box the text needs.
```

- `layoutMarkdown` has no DOM dependency: text widths come from your `measure`.
- Math is rendered by `@simple-mark/math` (MathJax, loaded the first time it's needed) and
  drawn as an image in the text's color. When bundling, alias MathJax's default font as the
  `@simple-mark/math` README shows.
- Code blocks get colors from `highlight` (`createHighlighter` from `@simple-mark/highlight`),
  TeX gets its colors without one; both as in the editor.

MIT. Values copied from other projects are credited in `THIRD_PARTY_NOTICES.txt`.
