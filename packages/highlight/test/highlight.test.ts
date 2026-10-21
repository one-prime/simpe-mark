import { describe, expect, it } from 'vitest';
import { createHighlighter, languageOf, loadLanguages } from '../src/index';

/** Tokens as readable [text, style] pairs. */
async function colors(code: string, info: string): Promise<[string, string][]> {
  await loadLanguages([info]);
  const tokens = createHighlighter(() => {})(code, info);
  return (tokens ?? []).map((t) => [code.slice(t.from, t.to), t.style]);
}

describe('languageOf', () => {
  it('reads the first word of the info string, like the preview', () => {
    expect(languageOf('ts')).toBe('typescript');
    expect(languageOf('js title="a b"')).toBe('javascript');
    expect(languageOf(' Python ')).toBe('python');
    expect(languageOf('html')).toBe('xml');
  });

  it("applies VS Code's own renames", () => {
    expect(languageOf('shell')).toBe('bash');
    expect(languageOf('tsx')).toBe('javascript');
    expect(languageOf('jsonc')).toBe('json');
    expect(languageOf('c#')).toBe('csharp');
    expect(languageOf('py3')).toBe('python');
  });

  it('knows no language for unknown or missing names', () => {
    expect(languageOf('')).toBeUndefined();
    expect(languageOf('nope')).toBeUndefined();
    expect(languageOf('constructor')).toBeUndefined();
  });
});

describe('createHighlighter', () => {
  it('leaves a block plain until its language loads, then asks to draw again', async () => {
    let ready: () => void = () => {};
    const drawn = new Promise<void>((resolve) => (ready = resolve));
    const highlight = createHighlighter(() => ready());
    expect(highlight('x = 1', 'ini')).toBeUndefined();
    await drawn;
    expect(highlight('x = 1', 'ini')).toEqual([
      { from: 0, to: 1, style: 'codeAttr' },
      { from: 4, to: 5, style: 'codeNumber' },
    ]);
  });

  it('gives exact offsets around characters highlight.js escapes', async () => {
    expect(await colors('const s = "a<b&\'c";', 'js')).toEqual([
      ['const', 'codeKeyword'],
      ['"a<b&\'c"', 'codeString'],
    ]);
  });

  it('keeps ${…} in a template string out of the string color', async () => {
    expect(await colors('`a${b}c`', 'js')).toEqual([
      ['`a', 'codeString'],
      ['c`', 'codeString'],
    ]);
  });

  it('colors embedded languages (JavaScript in HTML)', async () => {
    const tokens = await colors('<script>let a = 1;</script>', 'html');
    expect(tokens).toContainEqual(['let', 'codeKeyword']);
    expect(tokens).toContainEqual(['script', 'codeTag']);
  });

  it('colors comments, functions and diffs', async () => {
    expect(await colors('# note\ndef f(): pass', 'python')).toEqual([
      ['# note', 'codeComment'],
      ['def', 'codeKeyword'],
      ['f', 'codeTitle'],
      ['pass', 'codeKeyword'],
    ]);
    expect(await colors('-old\n+new', 'diff')).toEqual([
      ['-old', 'codeDeletion'],
      ['+new', 'codeAddition'],
    ]);
  });

  it('colors nothing for an unknown language', () => {
    expect(createHighlighter(() => {})('let a', 'nope')).toBeUndefined();
  });
});
