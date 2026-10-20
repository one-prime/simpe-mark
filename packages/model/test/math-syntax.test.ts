import { describe, expect, it } from 'vitest';
import { markdownParser, markdownStyles } from '../src/index';

/** Nodes as "Name:text" for the given names, in document order. */
function nodes(text: string, names = ['InlineMath', 'BlockMath', 'MathMark', 'MathText', 'Emphasis']): string[] {
  const out: string[] = [];
  markdownParser.parse(text).iterate({
    enter(n) {
      if (names.includes(n.name)) out.push(`${n.name}:${text.slice(n.from, n.to)}`);
    },
  });
  return out;
}

describe('inline math', () => {
  it('reads $...$ and keeps Markdown out of it', () => {
    expect(nodes('a $x_1 * y_2 * z$ b')).toEqual(['InlineMath:$x_1 * y_2 * z$', 'MathMark:$', 'MathMark:$']);
  });

  it('reads $$...$$ inside a paragraph', () => {
    expect(nodes('see $$\\int f$$ here', ['InlineMath'])).toEqual(['InlineMath:$$\\int f$$']);
  });

  it('leaves prices and spaced dollars as text', () => {
    expect(nodes('costs $5 and $10 today', ['InlineMath'])).toEqual([]);
    expect(nodes('a $ b $ c', ['InlineMath'])).toEqual([]);
    expect(nodes('a $b $ c', ['InlineMath'])).toEqual([]);
  });

  it('respects escapes', () => {
    expect(nodes('\\$x$', ['InlineMath'])).toEqual([]);
    expect(nodes('$a \\$ b$', ['InlineMath'])).toEqual(['InlineMath:$a \\$ b$']);
  });

  it('does not start inside inline code', () => {
    expect(nodes('`$x$`', ['InlineMath'])).toEqual([]);
  });
});

describe('block math', () => {
  it('reads a block between $$ lines', () => {
    expect(nodes('$$\na_1 *b*\n\\frac{1}{2}\n$$\nafter')).toEqual([
      'BlockMath:$$\na_1 *b*\n\\frac{1}{2}\n$$',
      'MathMark:$$',
      'MathText:a_1 *b*',
      'MathText:\\frac{1}{2}',
      'MathMark:$$',
    ]);
  });

  it('reads one-line blocks and text after the opening $$', () => {
    expect(nodes('$$ x^2 $$', ['BlockMath', 'MathText'])).toEqual(['BlockMath:$$ x^2 $$', 'MathText: x^2 ']);
    expect(nodes('$$ a\nb $$', ['BlockMath', 'MathText'])).toEqual(['BlockMath:$$ a\nb $$', 'MathText: a', 'MathText:b ']);
  });

  it('ends a paragraph without a blank line', () => {
    expect(nodes('text\n$$\nx\n$$', ['Paragraph', 'BlockMath'])).toEqual(['Paragraph:text', 'BlockMath:$$\nx\n$$']);
  });

  it('runs to the end of its quote when not closed', () => {
    const text = '> $$\n> x\n\nafter';
    expect(nodes(text, ['BlockMath', 'Paragraph'])).toEqual(['BlockMath:$$\n> x', 'Paragraph:after']);
  });

  it('keeps quote markers inside the block', () => {
    expect(nodes('> $$\n> x\n> $$', ['BlockMath', 'QuoteMark', 'MathText'])).toEqual([
      'QuoteMark:>',
      'BlockMath:$$\n> x\n> $$',
      'QuoteMark:>',
      'MathText:x',
      'QuoteMark:>',
    ]);
  });

  it('is styled as a math block with dimmed delimiters', () => {
    const { blocks, spans } = markdownStyles(markdownParser.parse('$$\nx\n$$\n\nand $y$'));
    expect(blocks.map((b) => b.style)).toEqual(['mathblock']);
    expect(spans.map((s) => s.styles.join(' '))).toEqual(['mark', 'mark', 'math mark', 'math', 'math mark']);
  });
});
