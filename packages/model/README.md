# @simple-mark/model

The Markdown model behind [SimpleMark](https://github.com/one-prime/simple-mark): Markdown
that never hides its syntax. Pure TypeScript, no DOM — usable in a browser, a worker, Node
or a canvas renderer.

- Parses CommonMark + GFM + `$math$` (Lezer) into **styled ranges**: line styles (headings,
  quotes, code blocks, tables, …) and non-overlapping inline spans (strong, em, code, link,
  and `mark` for the syntax characters, which stay visible and dimmed).
- A **theme** as plain data, and `resolveLook` to turn styles into font/color properties.
- **Tables**: display width (Korean, Chinese, Japanese count as two columns), row splitting,
  and re-aligning a table by padding its cells.

```ts
import { markdownParser, markdownStyles, resolveLook, defaultTheme, parseTable, renderTable } from '@simple-mark/model';

const { blocks, spans } = markdownStyles(markdownParser.parse('# Hi **there**'));
const look = resolveLook(['h1'], ['strong'], defaultTheme);
const aligned = renderTable(parseTable(['|a|b|', '|-|-:|', '|한글|2|'])).lines;
```

MIT
