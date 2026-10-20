/// <reference types="vite/client" />
import { defaultTheme } from '@simple-mark/model';
import sample from './sample.md?raw';
import { createEditor } from '../src/index';
import { recordScrolling } from './debug';

// The sample is a real file, so it can be opened in VS Code too (images next to it).

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
