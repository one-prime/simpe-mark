import { describe, expect, it } from 'vitest';
import { defaultTheme, flattenSpans, markdownParser, markdownStyles, resolveLineLook, resolveLook, type Span } from '../src/index';

function styles(text: string) {
  return markdownStyles(markdownParser.parse(text));
}

/** Spans as readable [text, styles] pairs. */
function spans(text: string): [string, string][] {
  return styles(text).spans.map((s: Span) => [text.slice(s.from, s.to), s.styles.join(' ')]);
}

describe('markdownStyles', () => {
  it('keeps emphasis markers as dimmed text around the styled content', () => {
    expect(spans('a **bold** b')).toEqual([
      ['**', 'strong mark'],
      ['bold', 'strong'],
      ['**', 'strong mark'],
    ]);
    expect(spans('_em_ ~~del~~')).toEqual([
      ['_', 'em mark'],
      ['em', 'em'],
      ['_', 'em mark'],
      ['~~', 'strike mark'],
      ['del', 'strike'],
      ['~~', 'strike mark'],
    ]);
  });

  it('styles headings as blocks and dims the # marker', () => {
    const text = '# Title\n\nbody';
    const result = styles(text);
    expect(result.blocks).toEqual([{ from: 0, to: 7, style: 'h1' }]);
    expect(spans(text)).toEqual([['#', 'mark']]);
  });

  it('covers both lines of a setext heading', () => {
    const text = 'Title\n===';
    expect(styles(text).blocks).toEqual([{ from: 0, to: text.length, style: 'h1' }]);
    expect(spans(text)).toEqual([['===', 'mark']]);
  });

  it('dims inline code backticks inside the code style', () => {
    expect(spans('`x`')).toEqual([
      ['`', 'code mark'],
      ['x', 'code'],
      ['`', 'code mark'],
    ]);
  });

  it('dims the link syntax and target, not the link text', () => {
    expect(spans('[text](http://x "t")')).toEqual([
      ['[', 'link mark'],
      ['text', 'link'],
      ['](', 'link mark'],
      ['http://x', 'link url'],
      [' ', 'link'],
      ['"t")', 'link mark'],
    ]);
  });

  it('shows a bare URL as a link, not as a dimmed target', () => {
    expect(spans('see www.example.com now')).toEqual([['www.example.com', 'link']]);
  });

  it('nests styles', () => {
    expect(spans('[**b**](u)')).toEqual([
      ['[', 'link mark'],
      ['**', 'link strong mark'],
      ['b', 'link strong'],
      ['**', 'link strong mark'],
      ['](', 'link mark'],
      ['u', 'link url'],
      [')', 'link mark'],
    ]);
  });

  it('dims only the backslash of an escape', () => {
    expect(spans('\\*not em\\*')).toEqual([
      ['\\', 'mark'],
      ['\\', 'mark'],
    ]);
  });

  it('styles code blocks, quotes, lists and rules', () => {
    const text = '> q\n\n- [ ] task\n1. one\n\n```js\nx\n```\n\n---';
    expect(styles(text).blocks.map((b) => b.style)).toEqual(['quote', 'codeblock', 'hr']);
    expect(spans(text)).toEqual([
      ['>', 'mark'],
      ['-', 'mark'],
      ['[ ]', 'mark'],
      ['1.', 'mark'],
      ['```js', 'mark'],
      ['```', 'mark'],
      ['---', 'mark'],
    ]);
  });

  it('styles tables as monospace blocks with a header and dimmed pipes', () => {
    const text = '| a | b |\n|---|--:|\n| 1 | 2 |';
    expect(styles(text).blocks).toEqual([
      { from: 0, to: text.length, style: 'table' },
      { from: 0, to: 9, style: 'tableHeader' },
    ]);
    expect(spans(text).filter(([, s]) => s === 'mark').map(([t]) => t)).toEqual(['|', '|', '|', '|---|--:|', '|', '|', '|']);
  });

  it('limits work to a range but keeps constructs that cross its edges whole', () => {
    const text = 'para one\n\n**bold**\n\npara *two*';
    const tree = markdownParser.parse(text);
    const from = text.indexOf('bold');
    const result = markdownStyles(tree, from, from + 1);
    expect(result.spans.map((s) => text.slice(s.from, s.to))).toEqual(['**', 'bold', '**']);
  });
});

describe('flattenSpans', () => {
  it('merges touching ranges with the same styles and drops empty ones', () => {
    expect(
      flattenSpans([
        { from: 0, to: 2, style: 'mark' },
        { from: 2, to: 4, style: 'mark' },
        { from: 5, to: 5, style: 'strong' },
      ]),
    ).toEqual([{ from: 0, to: 4, styles: ['mark'] }]);
  });
});

describe('theme', () => {
  it('lets markers stay dimmed inside links (later style wins)', () => {
    expect(resolveLook([], ['link', 'mark']).color).toBe(defaultTheme.inline.mark.color);
    expect(resolveLook([], ['mark', 'link']).color).toBe(defaultTheme.inline.mark.color);
  });

  it('combines line and text looks; line-only properties stay on the line', () => {
    expect(resolveLook(['h1'], ['em'])).toEqual({ fontScale: 2, fontWeight: 600, italic: true });
    expect(resolveLook(['codeblock'], [])).toEqual({ monospace: true });
    expect(resolveLineLook(['quote', 'codeblock'])).toMatchObject({ lineBackground: '#f6f8fa', borderLeft: '#d1d9e0' });
  });

  it('adds up indents of nested blocks', () => {
    expect(resolveLineLook(['quote', 'codeblock']).indent).toBe(2);
  });

  it('rounds and borders blocks only at their edges', () => {
    const middle = { first: [], last: [] };
    expect(resolveLineLook(['codeblock'], defaultTheme, { first: ['codeblock'], last: [] })).toMatchObject({ radiusTop: 6 / 16 });
    expect(resolveLineLook(['codeblock'], defaultTheme, middle)).not.toHaveProperty('radiusTop');
    expect(resolveLineLook(['codeblock'], defaultTheme, { first: [], last: ['codeblock'] })).toMatchObject({ radiusBottom: 6 / 16 });
    expect(resolveLineLook(['h1'], defaultTheme, middle)).not.toHaveProperty('borderBottom');
    expect(resolveLineLook(['h1'], defaultTheme, { first: [], last: ['h1'] }).borderBottom).toBe(defaultTheme.block.h1.borderBottom);
    // Corners belong to the block whose background shows: a table row in a code block has none.
    expect(resolveLineLook(['codeblock', 'tableRowAlt'])).not.toHaveProperty('radiusTop');
  });
});
