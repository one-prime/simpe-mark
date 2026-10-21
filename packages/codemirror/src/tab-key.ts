// Tab and Shift-Tab as in a text editor, by VS Code's rules: Tab inserts spaces up to the next
// tab stop (or a tab character, by the indent unit) and replaces a selection within a line; a
// selection across lines (or of whole lines) is indented instead. Shift-Tab outdents. Tables
// keep their own Tab (table-commands.ts, higher precedence). Ctrl-M (Shift-Alt-M on macOS, in
// the default keymap) makes Tab move the focus instead, as in VS Code.

import { indentLess, indentMore } from '@codemirror/commands';
import { getIndentUnit, indentUnit } from '@codemirror/language';
import { EditorSelection, type EditorState, type Extension, type StateCommand } from '@codemirror/state';
import { keymap, runScopeHandlers, ViewPlugin, type EditorView } from '@codemirror/view';
import { charWidth } from '@simple-mark/model';

/** The column `text` ends at, as VS Code counts it: tabs to the next stop, wide characters 2. */
function columnAfter(text: string, tabSize: number): number {
  let column = 0;
  for (const ch of text) column = ch === '\t' ? column + tabSize - (column % tabSize) : column + charWidth(ch.codePointAt(0)!);
  return column;
}

/** Whether Tab indents this range's lines rather than typing at it. */
function indentsLines(state: EditorState, from: number, to: number): boolean {
  if (from === to) return false;
  const line = state.doc.lineAt(from);
  return to > line.to || (from === line.from && to === line.to);
}

/** Tab: indentation at each cursor (or in place of a selection within a line), else indent lines. */
export const insertIndent: StateCommand = (target) => {
  const { state, dispatch } = target;
  if (state.readOnly) return false;
  if (state.selection.ranges.some((r) => indentsLines(state, r.from, r.to))) return indentMore(target);
  const unit = state.facet(indentUnit);
  const width = getIndentUnit(state);
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const column = columnAfter(line.text.slice(0, range.from - line.from), state.tabSize);
    const insert = unit.includes('\t') ? '\t' : ' '.repeat(width - (column % width));
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.indent' }));
  return true;
};

/** Shift-Tab: outdent the lines of each selection. */
export const removeIndent: StateCommand = indentLess;

/**
 * Tab while an IME is composing: CodeMirror skips its keymaps then, and the browser would move
 * the focus out of the editor. Take the key, let the IME commit, then run the editor's own Tab
 * binding (a table's next cell, or indentation).
 */
export const tabWhileComposing = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      view.dom.addEventListener('keydown', this.onKeydown, true);
    }

    destroy(): void {
      this.view.dom.removeEventListener('keydown', this.onKeydown, true);
    }

    onKeydown = (event: KeyboardEvent): void => {
      const { view } = this;
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      if (!(event.isComposing || event.keyCode === 229 || view.compositionStarted)) return;
      event.preventDefault();
      event.stopPropagation();
      // A fresh event: the composing one may carry the IME's key code instead of Tab's.
      const tab = new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: event.shiftKey });
      const start = Date.now();
      const run = () => {
        if (!view.compositionStarted) runScopeHandlers(view, tab, 'editor');
        else if (Date.now() - start < 1000) setTimeout(run, 20);
      };
      setTimeout(run, 0);
    };
  },
);

/** Tab and Shift-Tab for indentation, IME composition included. */
export function tabKey(): Extension {
  return [keymap.of([{ key: 'Tab', run: insertIndent, shift: removeIndent }]), tabWhileComposing];
}
