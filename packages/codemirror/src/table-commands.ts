// Table editing: Tab / Shift-Tab move between cells and Enter adds a row. Each command
// re-aligns the whole table in the same transaction, so it is one undo step. Outside a
// table the commands return false and the keys keep their normal meaning. IME composition
// (Korean) needs extra care: see lineBreakToRow and tabWhileComposing.

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState, Prec, type Extension, type StateCommand, type Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { cellAt, parseTable, renderTable, rowLine, type Table } from '@simple-mark/model';

interface TableLine {
  /** Start of the document line, including any prefix such as "> " or list indentation. */
  from: number;
  to: number;
  prefix: string;
  /** Where the table text starts on the line. */
  contentFrom: number;
  content: string;
}

interface TableAt {
  lines: TableLine[];
  table: Table;
  row: number;
  col: number;
}

/** Children of a Table node that are whole lines (the delimiter line is a TableDelimiter). */
const ROW_NODES = new Set(['TableHeader', 'TableDelimiter', 'TableRow']);

function findTable(state: EditorState, pos: number): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      if (node.name === 'Table') return node;
    }
  }
  return null;
}

/** The table under the cursor and the cell the cursor is in. */
function tableAt(state: EditorState): TableAt | null {
  const pos = state.selection.main.head;
  const node = findTable(state, pos);
  if (!node) return null;
  const lines: TableLine[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    // Rows only: inside a quote, the table also holds the QuoteMark (">") of each line.
    if (!ROW_NODES.has(child.name)) continue;
    const line = state.doc.lineAt(child.from);
    if (lines.at(-1)?.from === line.from) continue;
    lines.push({
      from: line.from,
      to: line.to,
      prefix: state.sliceDoc(line.from, child.from),
      contentFrom: child.from,
      content: state.sliceDoc(child.from, line.to),
    });
  }
  const index = lines.findIndex((l) => pos >= l.from && pos <= l.to);
  if (lines.length < 2 || index === -1) return null;
  const line = lines[index]!;
  return {
    lines,
    table: parseTable(lines.map((l) => l.content)),
    row: index <= 1 ? 0 : index - 1,
    col: cellAt(line.content, Math.max(0, pos - line.contentFrom)),
  };
}

/**
 * Replaces the table with `table` re-aligned and puts the cursor at the end of the text of cell
 * (`row`, `col`). `after` is inserted right after the table; with `cursorAfter` the cursor goes
 * to its end instead.
 */
function writeTable(state: EditorState, at: TableAt, table: Table, row: number, col: number, after = '', cursorAfter = false) {
  const { lines, cells } = renderTable(table);
  const prefix = (i: number) => at.lines[Math.min(i, at.lines.length - 1)]!.prefix;
  const full = lines.map((line, i) => prefix(i) + line);
  const insert = full.join(state.lineBreak) + after;
  const from = at.lines[0]!.from;
  let cursor = from + insert.length;
  if (!cursorAfter) {
    const target = rowLine(row);
    const lineStart = full.slice(0, target).reduce((sum, line) => sum + line.length + state.lineBreak.length, 0);
    cursor = from + lineStart + prefix(target).length + cells[row]![col]!.to;
  }
  return state.update({
    changes: { from, to: at.lines.at(-1)!.to, insert },
    selection: { anchor: cursor },
    scrollIntoView: true,
    userEvent: 'input.table',
  });
}

const emptyRow = (table: Table) => table.aligns.map(() => '');

/** Tab: re-align and go to the next cell, adding a row after the last one. */
export const nextCell: StateCommand = ({ state, dispatch }) => {
  const at = tableAt(state);
  if (!at) return false;
  const { table } = at;
  const columns = table.aligns.length;
  let { row, col } = at;
  if (col + 1 < columns) col++;
  else {
    row++;
    col = 0;
    if (row >= table.rows.length) table.rows.push(emptyRow(table));
  }
  dispatch(writeTable(state, at, table, row, col));
  return true;
};

/** Shift-Tab: re-align and go to the previous cell. */
export const previousCell: StateCommand = ({ state, dispatch }) => {
  const at = tableAt(state);
  if (!at) return false;
  let { row, col } = at;
  if (col > 0) col = Math.min(col, at.table.aligns.length) - 1;
  else if (row > 0) {
    row--;
    col = at.table.aligns.length - 1;
  }
  dispatch(writeTable(state, at, at.table, row, col));
  return true;
};

/**
 * Enter: re-align and add an empty row below, cursor in its first cell. On an empty last row,
 * remove it and leave the table: the cursor goes below a blank line, because GFM would read
 * a line right after a table as another row.
 */
export const insertRowBelow: StateCommand = ({ state, dispatch }) => {
  const at = tableAt(state);
  if (!at) return false;
  const { table, row } = at;
  if (row > 0 && row === table.rows.length - 1 && table.rows[row]!.every((cell) => cell === '')) {
    table.rows.splice(row, 1);
    dispatch(writeTable(state, at, table, 0, 0, state.lineBreak + state.lineBreak, true));
    return true;
  }
  table.rows.splice(row + 1, 0, emptyRow(table));
  dispatch(writeTable(state, at, table, row + 1, 0));
  return true;
};

/**
 * A typed line break inside a table becomes "add a row below". This catches the line breaks
 * the Enter command never sees: while an IME is composing (Korean: Enter right after a
 * syllable), CodeMirror skips its keymaps and the browser inserts the break itself, sometimes
 * before the syllable still being composed. The typed text stays in its cell.
 */
const lineBreakToRow = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('input') || tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop') || tr.isUserEvent('input.table')) {
    return tr;
  }
  const { startState } = tr;
  const kept: { from: number; to: number; insert: string }[] = [];
  let breakAt: { from: number; offset: number } | null = null;
  let other = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const removedBreaks = startState.doc.lineAt(toA).number - startState.doc.lineAt(fromA).number;
    const lines = inserted.toJSON();
    if (removedBreaks === 0 && lines.length === 2 && !breakAt) {
      breakAt = { from: fromA, offset: lines[0]!.length };
      kept.push({ from: fromA, to: toA, insert: lines.join('') });
    } else if (lines.length - 1 !== removedBreaks) {
      other = true;
    } else {
      kept.push({ from: fromA, to: toA, insert: inserted.sliceString(0, inserted.length, startState.lineBreak) });
    }
  });
  const at = breakAt as { from: number; offset: number } | null;
  if (!at || other) return tr;
  const withoutBreak = startState.changes(kept);
  const pos = withoutBreak.mapPos(at.from, -1) + at.offset;
  const state = startState.update({ changes: withoutBreak, selection: { anchor: pos } }).state;
  let row: Transaction | null = null;
  if (!insertRowBelow({ state, dispatch: (t) => (row = t) })) return tr;
  const done = row as Transaction | null;
  return { changes: withoutBreak.compose(done!.changes), selection: done!.selection, scrollIntoView: true, userEvent: 'input.table' };
});

/**
 * Tab while an IME is composing: CodeMirror skips its keymaps then, and the browser would move
 * the focus out of the editor. Take the key, let the IME commit, then move to the cell.
 */
const tabWhileComposing = ViewPlugin.fromClass(
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
      if (!(event.isComposing || event.keyCode === 229 || view.compositionStarted) || !tableAt(view.state)) return;
      event.preventDefault();
      event.stopPropagation();
      const command = event.shiftKey ? previousCell : nextCell;
      const start = Date.now();
      const run = () => {
        if (!view.compositionStarted) command(view);
        else if (Date.now() - start < 1000) setTimeout(run, 20);
      };
      setTimeout(run, 0);
    };
  },
);

/** Table editing keys, ahead of the default and Markdown keymaps, and their IME counterparts. */
export function tableEditing(): Extension {
  return [
    Prec.high(
      keymap.of([
        { key: 'Tab', run: nextCell, shift: previousCell },
        { key: 'Enter', run: insertRowBelow },
      ]),
    ),
    lineBreakToRow,
    tabWhileComposing,
  ];
}
