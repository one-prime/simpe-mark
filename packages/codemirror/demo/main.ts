import { defaultTheme } from '@simple-mark/model';
import { createEditor } from '../src/index';
import { recordScrolling } from './debug';

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

![A sunset](./images/sunset.png "Sample PNG")

A reference-style image ![logo][logo] in a sentence.

[logo]: ./images/logo.svg

A missing one: ![gone](./images/missing.png)

## Math

Inline math like $E = mc^2$ and $a_i * b_i * c_i$ sits in the text
(put the cursor inside it). Prices like $5 and $10 stay text.

$$
\\sum_{i=1}^{n} x_i^2 = \\frac{n(n+1)(2n+1)}{6}
$$

$$ \\mathbb{R}^n \\to \\mathfrak{g} $$

$$
\\frac{1}{
$$

---

The end.
`;

/** ?long: many images and formulas, for testing scrolling through unmeasured previews. */
function longDocument(): string {
  const parts = ['# Long document\n'];
  for (let i = 1; i <= 40; i++) {
    parts.push(
      `## Section ${i}\n\nSome text for section ${i}, long enough to wrap on a narrow window and keep the paragraph honest.\n\n` +
        `![Wide](./images/wide.png?${i})\n\n$$\n\\sum_{k=1}^{${i}} k = \\frac{${i}(${i}+1)}{2}\n$$\n\n![Sunset](./images/sunset.png?${i})\n`,
    );
  }
  return parts.join('\n');
}

const params = new URLSearchParams(location.search);
const doc = params.has('long') ? longDocument() : sample;
const source = document.getElementById('source')!;
const show = (text: string) => (source.textContent = text);

// ?mono=<font family> tries another monospace font, e.g. a Latin-only one for table alignment.
const mono = params.get('mono');
const theme = mono ? { ...defaultTheme, monospaceFamily: mono } : defaultTheme;

const view = createEditor(document.getElementById('editor')!, { doc, theme, onChange: show });
// For poking at the editor from the console or browser tests.
Object.assign(window, { view });
if (params.has('debug')) recordScrolling(view);
show(doc);
