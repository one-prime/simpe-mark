import { describe, expect, it } from 'vitest';
import { diffText, offsetToLineCh } from '../src/sync';

const apply = (text: string, d: ReturnType<typeof diffText>) => (d ? text.slice(0, d.from) + d.insert + text.slice(d.to) : text);

describe('diffText', () => {
  it('finds the one changed region', () => {
    expect(diffText('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' });
    expect(diffText('abc', 'abc')).toBeNull();
    expect(diffText('abc', '')).toEqual({ from: 0, to: 3, insert: '' });
  });

  it('never splits a CRLF line break', () => {
    const before = 'a\r\nb';
    const after = 'a\r\r\nb';
    const d = diffText(before, after)!;
    expect(apply(before, d)).toBe(after);
    expect(before.slice(d.from - 1, d.from + 1)).not.toBe('\r\n');
    expect(d.from === 0 || before[d.from - 1] !== '\r' || before[d.from] !== '\n').toBe(true);
  });

  it('never splits a surrogate pair', () => {
    const before = 'x😀y';
    const after = 'x😃y';
    const d = diffText(before, after)!;
    expect(d).toEqual({ from: 1, to: 3, insert: '😃' });
  });

  it('turns any text into any other', () => {
    const samples = ['', 'a', '\r\n', 'a\r\nb\r\n', '한글\r\n표', '😀😀', '| a |\r\n|---|'];
    for (const a of samples) for (const b of samples) expect(apply(a, diffText(a, b))).toBe(b);
  });
});

describe('offsetToLineCh', () => {
  it('counts lines by the given line ending', () => {
    const text = 'ab\r\ncd\r\nef';
    expect(offsetToLineCh(text, 0, '\r\n')).toEqual({ line: 0, ch: 0 });
    expect(offsetToLineCh(text, 2, '\r\n')).toEqual({ line: 0, ch: 2 });
    expect(offsetToLineCh(text, 4, '\r\n')).toEqual({ line: 1, ch: 0 });
    expect(offsetToLineCh(text, 10, '\r\n')).toEqual({ line: 2, ch: 2 });
    expect(offsetToLineCh('a\nb', 2, '\n')).toEqual({ line: 1, ch: 0 });
  });
});
