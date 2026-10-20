# simple-mark

Markdown that never hides its syntax. `# Heading` stays `# Heading`: the `#` is dimmed and
the heading is large. `**bold**` keeps its `**`. The text is exactly what the user typed.

```sh
npm install simple-mark
```

## Subpaths

| Import | What | Needs a DOM |
| --- | --- | --- |
| `simple-mark/model` | Parse (CommonMark + GFM + `$math$`) into styled ranges; theme; table helpers (display width, alignment) | no |
| `simple-mark/math` | TeX → self-contained SVG string (MathJax 4), font parts loaded on demand | no |
| `simple-mark/codemirror` | A CodeMirror 6 editor: styling, table editing, image and math previews | yes |

## Editor

```ts
import { createEditor } from 'simple-mark/codemirror';

const view = createEditor(document.getElementById('editor')!, {
  doc: '# Hello **world**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n$$\n\\sum_{k=1}^n k\n$$\n',
  onChange: (text) => save(text),          // text in the document's own line endings
  resolveImage: (src) => new URL(src, base).href,
});
```

- Tab / Shift-Tab move between table cells and Enter adds a row; each re-aligns the table.
  Korean, Chinese and Japanese text count as two columns and are drawn exactly two wide.
- Images and `$$` blocks preview below their source; `$inline$` math shows in a tooltip.
  MathJax loads only when a document has math.
- Line endings (`\r\n`, `\r`) are kept, so an unedited file saves back byte for byte.

## Styling model

```ts
import { markdownParser, markdownStyles, resolveLook, defaultTheme } from 'simple-mark/model';

const { blocks, spans } = markdownStyles(markdownParser.parse(text));
// blocks: line styles (h1…h6, quote, codeblock, table, …) by range
// spans:  non-overlapping runs with inline styles (strong, em, code, link, mark, …)
const look = resolveLook(['h1'], ['strong'], defaultTheme); // font, color, … for a canvas
```

## Math

```ts
import { renderMath } from 'simple-mark/math';

const { svg, error } = await renderMath('\\frac{1}{2}', true);
```

TeX packages that create links or HTML (`\href`, `\style`, raw HTML) are not available, so
documents from untrusted sources are safe to render.

## License

MIT
