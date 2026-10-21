import { describe, expect, it } from 'vitest';
import { markdownParser, markdownStyles, mathTokens } from '../src/index';

/** Tokens of one formula as readable [text, style] pairs, in document order. */
function tokens(tex: string): [string, string][] {
  return mathTokens([{ from: 0, text: tex }])
    .sort((a, b) => a.from - b.from)
    .map((t) => [tex.slice(t.from, t.to), t.style]);
}

/** Math-token spans of a Markdown text (markers and the plain math style left out). */
function mathSpans(text: string): [string, string][] {
  const { spans } = markdownStyles(markdownParser.parse(text), 0, text.length, (from, to) => text.slice(from, to));
  return spans
    .map((s): [string, string] => [text.slice(s.from, s.to), s.styles.filter((style) => style.startsWith('math') && style !== 'math').join(' ')])
    .filter(([, style]) => style);
}

describe('mathTokens', () => {
  it('colors commands and brackets by depth', () => {
    expect(tokens('\\frac{n(n+1)}{6}')).toEqual([
      ['\\frac', 'mathCommand'],
      ['{', 'mathBracket1'],
      ['(', 'mathBracket2'],
      [')', 'mathBracket2'],
      ['}', 'mathBracket1'],
      ['{', 'mathBracket1'],
      ['}', 'mathBracket1'],
    ]);
  });

  it('cycles through three depths', () => {
    expect(tokens('{{{{x}}}}').map(([, style]) => style)).toEqual([
      'mathBracket1',
      'mathBracket2',
      'mathBracket3',
      'mathBracket1',
      'mathBracket1',
      'mathBracket3',
      'mathBracket2',
      'mathBracket1',
    ]);
  });

  it('marks unmatched braces, but not unmatched ( and [', () => {
    expect(tokens('\\frac{1}{')).toEqual([
      ['\\frac', 'mathCommand'],
      ['{', 'mathBracket1'],
      ['}', 'mathBracket1'],
      ['{', 'mathBracketError'],
    ]);
    expect(tokens('x}')).toEqual([['}', 'mathBracketError']]);
    // A half-open interval is fine TeX.
    expect(tokens('[0, 1)')).toEqual([]);
  });

  it('closes a brace past unmatched ( and [, which never close past a brace', () => {
    expect(tokens('{[0, 1)}')).toEqual([
      ['{', 'mathBracket1'],
      ['}', 'mathBracket1'],
    ]);
    // The ) can't reach the ( past the brace; the braces still pair.
    expect(tokens('({)}')).toEqual([
      ['{', 'mathBracket1'],
      ['}', 'mathBracket1'],
    ]);
  });

  it('reads escaped braces and symbols as commands', () => {
    expect(tokens('\\{x\\} \\, \\\\ a')).toEqual([
      ['\\{', 'mathCommand'],
      ['\\}', 'mathCommand'],
      ['\\,', 'mathCommand'],
      ['\\\\', 'mathCommand'],
    ]);
  });

  it('colors comments to the end of the line', () => {
    expect(tokens('x % {note}\ny')).toEqual([['% {note}', 'mathComment']]);
    expect(tokens('50\\%')).toEqual([['\\%', 'mathCommand']]);
  });

  it('pairs brackets across the lines of a block', () => {
    const pieces = [
      { from: 3, text: '\\left(' },
      { from: 12, text: 'x \\right)' },
    ];
    expect(mathTokens(pieces).filter((t) => t.style.startsWith('mathBracket'))).toEqual([
      { from: 8, to: 9, style: 'mathBracket1' },
      { from: 20, to: 21, style: 'mathBracket1' },
    ]);
  });
});

describe('markdownStyles with math tokens', () => {
  it('colors the TeX of inline, one-line and block math, not the delimiters', () => {
    expect(mathSpans('a $\\sqrt{x}$ b')).toEqual([
      ['\\sqrt', 'mathCommand'],
      ['{', 'mathBracket1'],
      ['}', 'mathBracket1'],
    ]);
    expect(mathSpans('$$ \\to $$')).toEqual([['\\to', 'mathCommand']]);
    expect(mathSpans('$$\n\\frac{1}{\n$$')).toEqual([
      ['\\frac', 'mathCommand'],
      ['{', 'mathBracket1'],
      ['}', 'mathBracket1'],
      ['{', 'mathBracketError'],
    ]);
  });

  it('leaves quote markers out of block math', () => {
    expect(mathSpans('> $$\n> {x\n> }\n> $$')).toEqual([
      ['{', 'mathBracket1'],
      ['}', 'mathBracket1'],
    ]);
  });

  it('adds no math tokens without the text', () => {
    const text = '$\\to$';
    expect(markdownStyles(markdownParser.parse(text)).spans.map((s) => s.styles.join(' '))).toEqual(['math mark', 'math', 'math mark']);
  });
});
