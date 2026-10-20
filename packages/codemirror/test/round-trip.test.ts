import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { keepLineSeparator } from '../src/line-separator';

function roundTrip(text: string): string {
  return EditorState.create({ doc: text, extensions: keepLineSeparator(text) }).sliceDoc();
}

describe('round trip', () => {
  it.each([
    ['LF', '# Title\n\nbody **bold**\n'],
    ['CRLF', '# Title\r\n\r\nbody\r\n'],
    ['CR', '# Title\r\rbody\r'],
    ['no final newline', 'last line'],
    ['trailing spaces and tabs', 'hard break  \n\tindented\t\n'],
    ['setext and alternative markers', 'Title\n---\n\n* item\n+ item\n\n__strong__ *em*\n'],
    ['empty', ''],
  ])('keeps %s text byte for byte', (_, text) => {
    expect(roundTrip(text)).toBe(text);
  });
});
