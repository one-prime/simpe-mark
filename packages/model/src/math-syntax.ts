// Math in Markdown, as Pandoc reads it: $inline$ and $$display$$, the latter also as a block
// between `$$` lines. Math content is not parsed as Markdown, so `*` and `_` stay TeX.
//
//   InlineMath   MathMark "$" ... MathMark "$"        ($$...$$ inside a paragraph too)
//   BlockMath    MathMark "$$" MathText* MathMark "$$"

import type { BlockContext, BlockParser, InlineContext, InlineParser, Line, MarkdownExtension } from '@lezer/markdown';

const DOLLAR = 36;
const BACKSLASH = 92;

const isSpace = (ch: number) => ch === 32 || ch === 9 || ch === 10 || ch === 13;
const isDigit = (ch: number) => ch >= 48 && ch <= 57;

/**
 * Inline math: an opening `$` not followed by a space, a closing `$` not preceded by a space
 * nor followed by a digit ("$5 and $10" stays text). `$$...$$` works the same way.
 */
const inlineMath: InlineParser = {
  name: 'InlineMath',
  before: 'InlineCode',
  parse(cx: InlineContext, next: number, start: number): number {
    if (next !== DOLLAR) return -1;
    const size = cx.char(start + 1) === DOLLAR ? 2 : 1;
    const contentStart = start + size;
    if (contentStart >= cx.end || isSpace(cx.char(contentStart)) || cx.char(contentStart) === DOLLAR) return -1;
    for (let pos = contentStart; pos < cx.end; pos++) {
      const ch = cx.char(pos);
      if (ch === BACKSLASH) {
        pos++;
        continue;
      }
      if (ch !== DOLLAR) continue;
      const closes = size === 1 || cx.char(pos + 1) === DOLLAR;
      if (!closes || isSpace(cx.char(pos - 1))) {
        if (size === 2) pos++;
        continue;
      }
      const end = pos + size;
      if (size === 1 && isDigit(cx.char(end))) continue;
      return cx.addElement(cx.elt('InlineMath', start, end, [cx.elt('MathMark', start, contentStart), cx.elt('MathMark', pos, end)]));
    }
    return -1;
  },
};

/** Where `$$` opens a block: at the line's content start, not indented as code. */
function opensBlock(line: Line): boolean {
  return line.next === DOLLAR && line.text.charCodeAt(line.pos + 1) === DOLLAR && line.indent - line.baseIndent < 4;
}

/**
 * Whether `line` still belongs to every container (quote, list item) around the block. Lezer
 * sets `depth` on each line but leaves it out of its types; its own fenced code checks it the
 * same way. A quote ending ends the math block, as it ends a code block.
 */
function inContainers(cx: BlockContext, line: Line): boolean {
  const depth = (line as unknown as { depth?: number }).depth;
  return depth === undefined || depth >= cx.depth;
}

const blockMath: BlockParser = {
  name: 'BlockMath',
  before: 'FencedCode',
  parse(cx, line) {
    if (!opensBlock(line)) return false;
    const start = cx.lineStart + line.pos;
    const children = [cx.elt('MathMark', start, start + 2)];
    const first = line.text.slice(line.pos + 2);
    // "$$ x $$" on one line.
    const sameLine = /^(.*\S.*?)\$\$\s*$/.exec(first);
    if (sameLine) {
      const close = start + 2 + sameLine[1]!.length;
      children.push(cx.elt('MathText', start + 2, close), cx.elt('MathMark', close, close + 2));
      cx.nextLine();
      cx.addElement(cx.elt('BlockMath', start, close + 2, children));
      return true;
    }
    if (first.trim()) children.push(cx.elt('MathText', start + 2, cx.lineStart + line.text.length));
    let end = cx.lineStart + line.text.length;
    while (cx.nextLine() && inContainers(cx, line)) {
      children.push(...line.markers);
      const text = line.text.slice(line.pos);
      const textStart = cx.lineStart + line.pos;
      const close = text.indexOf('$$');
      if (close >= 0 && !text.slice(close + 2).trim()) {
        if (close > 0) children.push(cx.elt('MathText', textStart, textStart + close));
        children.push(cx.elt('MathMark', textStart + close, textStart + close + 2));
        end = textStart + close + 2;
        cx.nextLine();
        break;
      }
      if (text) children.push(cx.elt('MathText', textStart, cx.lineStart + line.text.length));
      end = cx.lineStart + line.text.length;
    }
    cx.addElement(cx.elt('BlockMath', start, end, children));
    return true;
  },
  // Like a code fence, `$$` ends a paragraph without a blank line.
  endLeaf: (_cx, line) => opensBlock(line),
};

export const MathSyntax: MarkdownExtension = {
  defineNodes: [{ name: 'BlockMath', block: true }, { name: 'InlineMath' }, { name: 'MathMark' }, { name: 'MathText' }],
  parseBlock: [blockMath],
  parseInline: [inlineMath],
};
