# @simple-mark/codemirror

A CodeMirror 6 Markdown editor that never hides syntax — part of
[SimpleMark](https://github.com/one-prime/simple-mark). `# Heading` stays `# Heading`: the
`#` is dimmed and the heading is large. The text is exactly what the user typed.

```ts
import { createEditor } from '@simple-mark/codemirror';

const view = createEditor(document.getElementById('editor')!, {
  doc: '# Hello **world**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
  onChange: (text) => save(text),        // in the document's own line endings
  resolveImage: (src) => new URL(src, base).href,
});
```

- **Tables**: Tab / Shift-Tab move between cells, Enter adds a row; each re-aligns the
  table. Korean, Chinese and Japanese line up (drawn exactly two columns wide), and typing
  them with an IME is safe.
- **Images** and `$$` math preview below their source; `$inline$` math in a tooltip. Math
  (`@simple-mark/math`) loads only when a document has math.
- **Line endings** are kept (`\r\n`, `\r`), so an unedited file saves back byte for byte.
- Accurate scroll heights for documents with many images and formulas.
- `simpleMark(theme)` gives the extensions for your own `EditorState`.

MIT
