import { describe, expect, it } from 'vitest';
import { cellAt, displayWidth, markdownParser, markdownStyles, parseTable, renderTable, rowLine, splitRow } from '../src/index';

const cellTexts = (row: string) => splitRow(row).map((c) => row.slice(c.from, c.to));

describe('displayWidth', () => {
  it('counts CJK and fullwidth characters as two columns', () => {
    expect(displayWidth('Alice')).toBe(5);
    expect(displayWidth('지민')).toBe(4);
    expect(displayWidth('東京abc')).toBe(7);
    expect(displayWidth('ＡＢ')).toBe(4);
  });

  it('counts combining marks as zero and astral characters once', () => {
    expect(displayWidth('é')).toBe(1);
    expect(displayWidth('𠀋')).toBe(2);
  });
});

describe('splitRow', () => {
  it('splits on pipes with or without outer pipes', () => {
    expect(cellTexts('| a | b |')).toEqual([' a ', ' b ']);
    expect(cellTexts('a | b')).toEqual(['a ', ' b']);
    expect(cellTexts('| a |  ')).toEqual([' a ']);
  });

  it('keeps escaped pipes inside a cell', () => {
    expect(cellTexts('| a \\| b | c |')).toEqual([' a \\| b ', ' c ']);
  });

  it('keeps empty cells between pipes', () => {
    expect(cellTexts('|  | x |')).toEqual(['  ', ' x ']);
    expect(cellTexts('|')).toEqual([]);
  });
});

describe('cellAt', () => {
  it('finds the cell under an offset; outer pipes belong to their cell', () => {
    const row = '| ab | cd |';
    expect(cellAt(row, 0)).toBe(0);
    expect(cellAt(row, 3)).toBe(0);
    expect(cellAt(row, 6)).toBe(1);
    expect(cellAt(row, row.length)).toBe(1);
  });
});

describe('renderTable', () => {
  const demo = ['| Name  | Age | City  |', '|-------|----:|-------|', '| Alice |  30 | Seoul |', '| 지민  |   4 | Busan |'];

  it('leaves an aligned table unchanged', () => {
    expect(renderTable(parseTable(demo)).lines).toEqual(demo);
  });

  it('pads columns by display width and follows column alignment', () => {
    const lines = ['|a|b|c|', '|:-|:-:|-:|', '|한국어|x|1|', '|y|가운데|22|'];
    expect(renderTable(parseTable(lines)).lines).toEqual([
      '| a      |   b    |   c |',
      '|:-------|:------:|----:|',
      '| 한국어 |   x    |   1 |',
      '| y      | 가운데 |  22 |',
    ]);
  });

  it('fills short rows and keeps extra cells', () => {
    const table = parseTable(['| a | b |', '|---|---|', '| 1 |', '| 1 | 2 | 3 |']);
    expect(table.rows).toEqual([
      ['a', 'b'],
      ['1', ''],
      ['1', '2', '3'],
    ]);
    expect(renderTable(table).lines).toEqual(['| a   | b   |', '|-----|-----|', '| 1   |     |', '| 1   | 2   | 3   |']);
  });

  it('reports where each cell text lies', () => {
    const { lines, cells } = renderTable(parseTable(['| a | bb |', '|---|---:|', '|  | 1 |']));
    const at = (row: number, col: number) => {
      const c = cells[row]![col]!;
      return [lines[rowLine(row)]!.slice(c.from, c.to), c.from];
    };
    expect(lines).toEqual(['| a   |  bb |', '|-----|----:|', '|     |   1 |']);
    expect(at(0, 1)).toEqual(['bb', 9]);
    expect(at(1, 0)).toEqual(['', 2]);
    expect(at(1, 1)).toEqual(['1', 10]);
  });
});

describe('table styles', () => {
  it('shades every second body row', () => {
    const text = '| h |\n|---|\n| 1 |\n| 2 |\n| 3 |\n| 4 |';
    const alt = markdownStyles(markdownParser.parse(text)).blocks.filter((b) => b.style === 'tableRowAlt');
    expect(alt.map((b) => text.slice(b.from, b.to))).toEqual(['| 2 |', '| 4 |']);
  });
});
