import { indentUnit } from '@codemirror/language';
import { EditorSelection, EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { insertIndent, removeIndent } from '../src/tab-key';

/**
 * Runs `command` on `doc`, where "[" and "]" mark the selection (or "^" a cursor; several are
 * allowed); returns the text with the new selection marked the same way.
 */
function run(command: StateCommand, doc: string, unit = '    '): string | false {
  const ranges = [];
  let text = '';
  let anchor = -1;
  for (const ch of doc) {
    if (ch === '^') ranges.push(EditorSelection.cursor(text.length));
    else if (ch === '[') anchor = text.length;
    else if (ch === ']') ranges.push(EditorSelection.range(anchor, text.length));
    else text += ch;
  }
  let state = EditorState.create({
    doc: text,
    selection: EditorSelection.create(ranges),
    extensions: [EditorState.allowMultipleSelections.of(true), indentUnit.of(unit)],
  });
  let tr: Transaction | null = null;
  if (!command({ state, dispatch: (t) => (tr = t) })) return false;
  state = (tr as Transaction | null)!.state;
  let out = state.sliceDoc();
  for (const range of [...state.selection.ranges].reverse()) {
    out = range.empty
      ? out.slice(0, range.head) + '^' + out.slice(range.head)
      : out.slice(0, range.from) + '[' + out.slice(range.from, range.to) + ']' + out.slice(range.to);
  }
  return out;
}

describe('insertIndent (Tab)', () => {
  it('inserts spaces up to the next tab stop, anywhere in a line', () => {
    expect(run(insertIndent, '^text')).toBe('    ^text');
    expect(run(insertIndent, 'ab^cd')).toBe('ab  ^cd');
    expect(run(insertIndent, 'abcd^')).toBe('abcd    ^');
  });

  it('counts a tab character as reaching the next stop', () => {
    expect(run(insertIndent, '\tx^')).toBe('\tx   ^');
  });

  it('counts Korean and other wide characters as two columns, as VS Code', () => {
    expect(run(insertIndent, '한^')).toBe('한  ^');
    expect(run(insertIndent, 'a한^')).toBe('a한 ^');
  });

  it('inserts a tab character when indenting with tabs', () => {
    expect(run(insertIndent, 'ab^cd', '\t')).toBe('ab\t^cd');
  });

  it('replaces a selection within a line', () => {
    expect(run(insertIndent, 'a[bc]d')).toBe('a   ^d');
  });

  it('indents the lines of a selection across lines, or of a whole line', () => {
    expect(run(insertIndent, 'o[ne\ntw]o\nthree')).toBe('    o[ne\n    tw]o\nthree');
    expect(run(insertIndent, '[one]\ntwo')).toBe('    [one]\ntwo');
  });

  it('works at every cursor', () => {
    expect(run(insertIndent, '^a\nbb^')).toBe('    ^a\nbb  ^');
  });

  it('does nothing in a read-only document', () => {
    const state = EditorState.create({ doc: 'x', extensions: EditorState.readOnly.of(true) });
    expect(insertIndent({ state, dispatch: () => {} })).toBe(false);
  });
});

describe('removeIndent (Shift-Tab)', () => {
  it('outdents the line of the cursor by one unit', () => {
    expect(run(removeIndent, '        a^')).toBe('    a^');
    expect(run(removeIndent, '  a^')).toBe('a^');
  });

  it('outdents every selected line', () => {
    expect(run(removeIndent, '    o[ne\n    tw]o')).toBe('o[ne\ntw]o');
  });
});
