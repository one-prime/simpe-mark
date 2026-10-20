import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import { markdownExtensions } from '@simple-mark/model';
import { describe, expect, it } from 'vitest';
import { keepLineSeparator } from '../src/line-separator';
import { insertRowBelow, nextCell, previousCell, tableEditing } from '../src/table-commands';

/** Runs `command` on `doc`, where "^" marks the cursor; returns the result with "^" at the new cursor. */
function run(command: StateCommand, doc: string): string | false {
  const cursor = doc.indexOf('^');
  const text = doc.slice(0, cursor) + doc.slice(cursor + 1);
  let state = EditorState.create({
    doc: text,
    selection: { anchor: cursor },
    extensions: [keepLineSeparator(text), markdown({ base: commonmarkLanguage, extensions: markdownExtensions })],
  });
  let tr: Transaction | null = null;
  if (!command({ state, dispatch: (t) => (tr = t) })) return false;
  state = (tr as Transaction | null)!.state;
  const out = state.sliceDoc();
  const head = state.selection.main.head;
  return out.slice(0, head) + '^' + out.slice(head);
}

describe('nextCell (Tab)', () => {
  it('aligns the table and moves to the end of the next cell', () => {
    expect(run(nextCell, '|a^|bb|\n|-|-|\n|1|2|')).toBe('| a   | bb^  |\n|-----|-----|\n| 1   | 2   |');
  });

  it('wraps to the next row, skipping the delimiter row', () => {
    expect(run(nextCell, '| a | b^ |\n|---|---|\n| 1 | 2 |')).toBe('| a   | b   |\n|-----|-----|\n| 1^   | 2   |');
  });

  it('adds a row after the last cell', () => {
    expect(run(nextCell, '| a | b |\n|---|---|\n| 1 | 2^ |')).toBe('| a   | b   |\n|-----|-----|\n| 1   | 2   |\n| ^    |     |');
  });

  it('pads Korean text by display width', () => {
    expect(run(nextCell, '| 이름 | x^ |\n|---|---|\n| 지민 | 1 |')).toBe('| 이름 | x   |\n|------|-----|\n| ^지민 | 1   |'.replace('^지민', '지민^'));
  });

  it('keeps CRLF line endings and quote prefixes', () => {
    expect(run(nextCell, '> | a^ | b |\r\n> |---|---|\r\n> | 1 | 2 |')).toBe('> | a   | b^   |\r\n> |-----|-----|\r\n> | 1   | 2   |');
  });

  it('does nothing outside a table', () => {
    expect(run(nextCell, 'just ^text')).toBe(false);
  });
});

describe('previousCell (Shift-Tab)', () => {
  it('moves back, wrapping to the previous row', () => {
    expect(run(previousCell, '| a | b |\n|---|---|\n| ^1 | 2 |')).toBe('| a   | b^   |\n|-----|-----|\n| 1   | 2   |');
  });
});

describe('typed line breaks in a table (IME Enter)', () => {
  /** Applies a browser-like input transaction to `doc` ("^" = cursor) with table editing on. */
  function type(doc: string, change: (cursor: number) => { from: number; to?: number; insert: string }, userEvent = 'input.type'): string {
    const cursor = doc.indexOf('^');
    const text = doc.slice(0, cursor) + doc.slice(cursor + 1);
    const start = EditorState.create({
      doc: text,
      selection: { anchor: cursor },
      extensions: [markdown({ base: commonmarkLanguage, extensions: markdownExtensions }), tableEditing()],
    });
    const state = start.update({ changes: change(cursor), userEvent }).state;
    const out = state.sliceDoc();
    const head = state.selection.main.head;
    return out.slice(0, head) + '^' + out.slice(head);
  }
  const table = '| a | b |\n|---|---|\n| 수빈^ | 2 |';
  const added = '| a    | b   |\n|------|-----|\n| 수빈 | 2   |\n| ^     |     |';

  it('turns a break after the syllable into a new row', () => {
    expect(type(table, (c) => ({ from: c, insert: '\n' }))).toBe(added);
  });

  it('keeps the syllable in its cell when the break lands before it', () => {
    expect(type(table, (c) => ({ from: c - 1, insert: '\n' }))).toBe(added);
  });

  it('keeps text committed together with the break', () => {
    expect(type('| a | b |\n|---|---|\n| 수^ | 2 |', (c) => ({ from: c, insert: '빈\n' }), 'input.type.compose')).toBe(added);
  });

  it('leaves breaks outside tables and pasted text alone', () => {
    expect(type('para^graph', (c) => ({ from: c, insert: '\n' }))).toBe('para^\ngraph');
    expect(type(table, (c) => ({ from: c, insert: 'x\ny' }), 'input.paste')).toBe('| a | b |\n|---|---|\n| 수빈^x\ny | 2 |');
  });
});

describe('insertRowBelow (Enter)', () => {
  it('adds an empty row below the current one', () => {
    expect(run(insertRowBelow, '| a | b |\n|---|---|\n| 1^ | 2 |\n| 3 | 4 |')).toBe(
      '| a   | b   |\n|-----|-----|\n| 1   | 2   |\n| ^    |     |\n| 3   | 4   |',
    );
  });

  it('adds the first body row from the header', () => {
    expect(run(insertRowBelow, '| a^ | b |\n|---|---|')).toBe('| a   | b   |\n|-----|-----|\n| ^    |     |');
  });

  it('leaves the table from an empty last row, below a blank line', () => {
    expect(run(insertRowBelow, '| a | b |\n|---|---|\n| 1 | 2 |\n| ^ |  |\n\nafter')).toBe('| a   | b   |\n|-----|-----|\n| 1   | 2   |\n\n^\n\nafter');
  });

  it('treats a text line right after the table as a row (GFM), so an empty row above it is not the last', () => {
    expect(run(insertRowBelow, '| a |\n|---|\n| ^ |\nafter')).toBe('| a     |\n|-------|\n|       |\n| ^      |\n| after |');
  });

  it('keeps list indentation on new rows', () => {
    expect(run(insertRowBelow, '- | a^ |\n  |---|')).toBe('- | a   |\n  |-----|\n  | ^    |');
  });
});
