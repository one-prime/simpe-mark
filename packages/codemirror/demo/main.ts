import { defaultTheme } from '@simplemark/model';
import { createEditor } from '../src/index';

const sample = `# SimpleMark

Markdown that **never hides its syntax**. Markers like \`#\`, \`**\` and \`_\` stay
visible but dimmed; the text they wrap gets the style.

## Inline styles

Some **bold**, some _emphasis_, ***both***, ~~struck~~ and \`inline code\`.
A [link](https://example.com "title"), an autolink <https://example.com>, a bare
www.example.com, and an escaped \\*star\\*.

Setext heading
--------------

> A quote with **bold** inside.
> 한국어도 잘 보여야 합니다.

- [ ] a task
- [x] a done task
- a bullet
  1. nested ordered

\`\`\`ts
const answer = 42; // code blocks keep their fences
\`\`\`

| Name  | Age | City  |
|-------|----:|-------|
| Alice |  30 | Seoul |
| 지민  |   4 | Busan |

## Images

![A cat](./images/cat.png "Our cat")

A reference-style image ![logo][logo] in a sentence.

[logo]: ./images/logo.svg

## Math

Inline math like $E = mc^2$ and $a_i + b_i$ sits in the text.

$$
\\sum_{i=1}^{n} x_i^2 = \\frac{n(n+1)(2n+1)}{6}
$$

---

The end.
`;

const source = document.getElementById('source')!;
const show = (text: string) => (source.textContent = text);

// ?mono=<font family> tries another monospace font, e.g. a Latin-only one for table alignment.
const mono = new URLSearchParams(location.search).get('mono');
const theme = mono ? { ...defaultTheme, monospaceFamily: mono } : defaultTheme;

const view = createEditor(document.getElementById('editor')!, { doc: sample, theme, onChange: show });
// For poking at the editor from the console or browser tests.
Object.assign(window, { view });
show(sample);
