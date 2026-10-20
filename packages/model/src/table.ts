// GFM pipe tables as text: display widths, cells, and re-padding so the pipes line up in a
// monospace font. The table stays plain Markdown; formatting only changes spaces and dashes.

/** Characters drawn two columns wide in a monospace font (East Asian Wide and Fullwidth). */
const WIDE: readonly [number, number][] = [
  [0x1100, 0x115f], // Hangul Jamo initial consonants
  [0x2e80, 0x303e], // CJK radicals, symbols and punctuation
  [0x3041, 0x33ff], // Hiragana, Katakana, Bopomofo, Hangul compatibility Jamo, CJK compatibility
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe10, 0xfe19], // vertical forms
  [0xfe30, 0xfe6f], // CJK compatibility forms, small form variants
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6], // fullwidth signs
  [0x1f300, 0x1f64f], // pictographs, emoticons
  [0x1f900, 0x1f9ff], // supplemental pictographs
  [0x20000, 0x3fffd], // CJK extensions B and later
];

/** Characters that take no column of their own (combining marks, joiners, variation selectors). */
const ZERO: readonly [number, number][] = [
  [0x0300, 0x036f],
  [0x1160, 0x11ff], // Hangul Jamo medial vowels and final consonants
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f],
  [0x20d0, 0x20ff],
  [0xd7b0, 0xd7ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
];

const inRanges = (ranges: readonly [number, number][], cp: number) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/** Columns a character takes in a monospace font: 0, 1 or 2. */
export function charWidth(codePoint: number): 0 | 1 | 2 {
  if (codePoint < 0x300) return 1;
  if (inRanges(ZERO, codePoint)) return 0;
  return inRanges(WIDE, codePoint) ? 2 : 1;
}

/** Columns `text` takes in a monospace font ("지민" → 4). */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += charWidth(ch.codePointAt(0)!);
  return width;
}

export type ColumnAlign = 'none' | 'left' | 'center' | 'right';

/** A cell of a row: the raw text between two pipes (spaces included). */
export interface RowCell {
  from: number;
  to: number;
}

/**
 * The cells of a table row. Pipes split cells unless escaped (`\|`); outer pipes are
 * optional, as in GFM.
 */
export function splitRow(row: string): RowCell[] {
  const pipes: number[] = [];
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\') i++;
    else if (row[i] === '|') pipes.push(i);
  }
  const cells: RowCell[] = [];
  let start = 0;
  for (const pipe of pipes) {
    cells.push({ from: start, to: pipe });
    start = pipe + 1;
  }
  cells.push({ from: start, to: row.length });
  const blank = (c: RowCell) => !row.slice(c.from, c.to).trim();
  if (pipes.length && blank(cells.at(-1)!)) cells.pop();
  if (pipes.length && cells.length && blank(cells[0]!)) cells.shift();
  return cells;
}

/** The index of the cell containing `offset` in `row` (outer pipes count toward their cell). */
export function cellAt(row: string, offset: number): number {
  const cells = splitRow(row);
  const index = cells.findIndex((c) => offset <= c.to);
  return index === -1 ? Math.max(0, cells.length - 1) : index;
}

/** A table's content: the delimiter row becomes `aligns`; `rows[0]` is the header. */
export interface Table {
  aligns: ColumnAlign[];
  /** Trimmed cell texts. Rows may hold more cells than columns; the extra text is kept. */
  rows: string[][];
}

function parseAlign(cell: string): ColumnAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : 'none';
}

/** Reads table lines (header, delimiter, body rows) without any line prefix such as "> ". */
export function parseTable(lines: readonly string[]): Table {
  const cellTexts = (line: string) => splitRow(line).map((c) => line.slice(c.from, c.to).trim());
  const aligns = cellTexts(lines[1] ?? '').map(parseAlign);
  const rows = [lines[0] ?? '', ...lines.slice(2)].map(cellTexts);
  for (const row of rows) while (row.length < aligns.length) row.push('');
  return { aligns, rows };
}

/** The line of `lines` that holds table row `row` (the delimiter line sits between rows 0 and 1). */
export function rowLine(row: number): number {
  return row === 0 ? 0 : row + 1;
}

export interface RenderedTable {
  lines: string[];
  /** Where each cell's text lies in its line: `cells[row][col]`, row as in `Table.rows`. */
  cells: RowCell[][];
}

function pad(text: string, width: number, align: ColumnAlign): { text: string; left: number } {
  const extra = Math.max(0, width - displayWidth(text));
  const left = align === 'right' ? extra : align === 'center' ? Math.floor(extra / 2) : 0;
  return { text: ' '.repeat(left) + text + ' '.repeat(extra - left), left };
}

/** The table as aligned lines: `| cell | cell |`, columns padded to their widest cell. */
export function renderTable(table: Table): RenderedTable {
  const columns = Math.max(table.aligns.length, ...table.rows.map((r) => r.length));
  const widths = Array.from({ length: columns }, (_, c) => Math.max(3, ...table.rows.map((r) => displayWidth(r[c] ?? ''))));
  const cells: RowCell[][] = [];
  const rowText = (row: string[]) => {
    let line = '|';
    const positions: RowCell[] = [];
    row.forEach((text, c) => {
      const padded = pad(text, widths[c]!, table.aligns[c] ?? 'none');
      const from = line.length + 1 + (text ? padded.left : 0);
      positions.push({ from, to: from + text.length });
      line += ` ${padded.text} |`;
    });
    cells.push(positions);
    return line;
  };
  const delimiter =
    '|' +
    table.aligns
      .map((align, c) => {
        const left = align === 'left' || align === 'center' ? ':' : '-';
        const right = align === 'right' || align === 'center' ? ':' : '-';
        return `${left}${'-'.repeat(widths[c]!)}${right}`;
      })
      .join('|') +
    '|';
  const [header = [], ...body] = table.rows;
  return { lines: [rowText(header), delimiter, ...body.map(rowText)], cells };
}
