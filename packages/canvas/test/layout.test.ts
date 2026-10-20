import { charWidth, defaultTheme } from '@simple-mark/model';
import { describe, expect, it } from 'vitest';
import { layoutMarkdown, type LayoutOptions, type MarkdownLayout } from '../src/index';

/** Fake metrics: every column is half the font size (CJK: two columns). */
const measure = (text: string, font: string) => {
  const size = parseFloat(/([\d.]+)px/.exec(font)![1]!);
  let columns = 0;
  for (const ch of text) columns += charWidth(ch.codePointAt(0)!);
  return (columns * size) / 2;
};

const style = { fontFamily: 'sans-serif', fontSize: 20, fontWeight: 400, lineHeight: 1.5, color: '#111' };

function layout(text: string, options: Partial<LayoutOptions> = {}): MarkdownLayout {
  return layoutMarkdown(text, { width: 400, style, measure, ...options });
}

/** Visual lines as text, in order. */
function rows(result: MarkdownLayout): string[] {
  const byTop = new Map<number, string>();
  for (const run of result.runs) byTop.set(run.top, (byTop.get(run.top) ?? '') + run.text);
  return [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text);
}

describe('layoutMarkdown', () => {
  it('keeps the syntax as text: markers dimmed, content styled', () => {
    const result = layout('Some **bold** text');
    expect(result.runs.map((r) => r.text)).toEqual(['Some ', '**', 'bold', '**', ' text']);
    const [, mark, bold] = result.runs;
    expect(mark!.color).toBe(defaultTheme.inline.mark.color);
    expect(bold!.font).toBe('700 20px sans-serif');
    expect(result.runs[0]!.color).toBe('#111');
  });

  it('makes headings bigger, with taller lines, and keeps the # dimmed', () => {
    const result = layout('# Title\nbody');
    const [hash, title, body] = result.runs;
    expect(hash).toMatchObject({ text: '#', color: defaultTheme.inline.mark.color, fontSize: 32, height: 48 });
    expect(title).toMatchObject({ text: ' Title', font: '700 32px sans-serif', top: 0 });
    expect(body).toMatchObject({ text: 'body', top: 48, height: 30 });
    expect(result.height).toBe(78);
  });

  it('wraps between words and breaks Korean anywhere, like the browser', () => {
    // 400px at 10px per column: 40 columns per line.
    expect(rows(layout('word '.repeat(12).trim()))).toEqual(['word word word word word word word word ', 'word word word word']);
    expect(rows(layout('한'.repeat(25)))).toEqual(['한'.repeat(20), '한'.repeat(5)]);
    expect(rows(layout('x'.repeat(50)))).toEqual(['x'.repeat(40), 'x'.repeat(10)]);
  });

  it('keeps the text\'s own lines with automatic width, and reports its width', () => {
    const result = layout('short\na longer line', { width: Infinity });
    expect(rows(result)).toEqual(['short', 'a longer line']);
    expect(result.width).toBe(130);
  });

  it('draws tables on a column grid: Korean takes exactly two columns', () => {
    const result = layout('| a  | b |\n|----|---|\n| 한 | 2 |');
    const korean = result.runs.find((r) => r.text.includes('한'))!;
    expect(korean.column).toBe(10); // monospace '0' at 20px in the fake metrics
    expect(korean.font).toContain(defaultTheme.monospaceFamily);
    // Every row has the same width because padding counts display columns.
    const widths = [0, 30, 60].map((top) => result.runs.filter((r) => r.top === top).reduce((sum, r) => sum + r.width, 0));
    expect(new Set(widths).size).toBe(1);
  });

  it('gives code blocks a line background and quotes a bar and an indent', () => {
    const code = layout('```\nx\n```');
    expect(code.lines).toHaveLength(3);
    expect(code.lines.every((l) => l.background === defaultTheme.block.codeblock.lineBackground)).toBe(true);
    const quote = layout('> quoted');
    expect(quote.lines[0]!.bar).toMatchObject({ color: defaultTheme.block.quote.borderLeft });
    expect(quote.runs[0]!.x).toBeGreaterThan(0);
  });

  it('puts images below their line, scaled to fit, with placeholders while loading', () => {
    const sizes: Record<string, { width: number; height: number } | null> = { 'big.png': { width: 1600, height: 900 }, 'gone.png': null };
    const result = layout('![a](big.png) ![b](gone.png)\n![c](later.png)\n\n![d][nope]', { imageSize: (src) => sizes[src] });
    const [big, gone, later, nope] = result.boxes;
    expect(big).toMatchObject({ kind: 'image', status: 'ready', width: 400, height: 225, y: 30 + (4 / 15) * 20 });
    expect(gone).toMatchObject({ status: 'missing', raw: 'gone.png' });
    expect(later).toMatchObject({ status: 'loading', src: 'later.png' });
    expect(nope).toMatchObject({ status: 'missing', src: null, raw: '[nope]' });
  });

  it('centers display math below its block, sized from the rendered formula', () => {
    const result = layout('$$\nx^2\n$$', { mathSize: () => ({ width: 2, height: 1 }) });
    expect(result.boxes).toEqual([{ kind: 'math', x: 180, y: 90 + (4 / 15) * 20, width: 40, height: 20, tex: 'x^2', status: 'ready' }]);
    expect(layout('$$ x $$', { mathSize: () => undefined }).boxes[0]).toMatchObject({ status: 'loading' });
    expect(layout('$$ \\frac{ $$', { mathSize: () => null }).boxes[0]).toMatchObject({ status: 'error' });
  });

  it('aligns visual lines', () => {
    expect(layout('ab', { style: { ...style, textAlign: 'center' } }).runs[0]!.x).toBe(190);
    expect(layout('ab', { style: { ...style, textAlign: 'right' } }).runs[0]!.x).toBe(380);
  });

  it('reads Windows line endings like any other', () => {
    expect(rows(layout('# a\r\nb'))).toEqual(['# a', 'b']);
  });
});
