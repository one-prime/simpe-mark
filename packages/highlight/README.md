# @simple-mark/highlight

Code block colors for [SimpleMark](https://github.com/one-prime/simple-mark) with
highlight.js — the highlighter of VS Code's Markdown preview, so the same fence names
(`ts`, `py`, `sh`, `html`…) find the same 193 languages. No DOM needed: the result is ranges
with `@simple-mark/model`'s code styles, which the editor and the canvas draw alike.

```ts
import { createHighlighter } from '@simple-mark/highlight';
import { markdownStyles } from '@simple-mark/model';

const highlight = createHighlighter(() => redraw());
const { spans } = markdownStyles(tree, 0, text.length, { slice: (a, b) => text.slice(a, b), highlight });
```

- Each language loads the first time a block needs it (bundlers make each a chunk); until
  then the block is plain and `onReady` is called when it can be drawn in color.
- `loadLanguages(infos)` loads ahead, for hosts that draw once (a command-line render).
- Fence names are read as the preview reads them, its own renames included (`shell` → bash,
  `tsx` → JSX, `jsonc` → JSON). Blocks without a known language stay plain; there is no
  guessing.

MIT
