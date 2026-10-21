// Which ranges of a Markdown text get which style. Syntax is never hidden: markers get the
// "mark" style (dimmed) and the content they wrap gets its own style. Every renderer (the
// CodeMirror editor, a canvas) draws from this one result, so they never disagree.

import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common';
import { mathTokens, type MathPiece } from './math-tokens';

/** Styles of whole lines, in precedence order (later wins when two set the same property). */
export const BLOCK_STYLES = ['quote', 'codeblock', 'mathblock', 'table', 'tableHeader', 'tableRowAlt', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type BlockStyle = (typeof BLOCK_STYLES)[number];

/**
 * Styles of text ranges, in precedence order ("mark" last, so markers stay dimmed everywhere).
 * The math* ones color a formula's TeX (see math-tokens.ts), the code* ones the text of a
 * fenced code block (from a highlighter, see StyleSource).
 */
export const INLINE_STYLES = [
  'link',
  'strong',
  'em',
  'strike',
  'code',
  'math',
  'mathCommand',
  'mathComment',
  'mathBracket1',
  'mathBracket2',
  'mathBracket3',
  'mathBracketError',
  'codeKeyword',
  'codeLiteral',
  'codeType',
  'codeNumber',
  'codeString',
  'codeComment',
  'codeTitle',
  'codeMeta',
  'codeVariable',
  'codeAttr',
  'codeTag',
  'codeSection',
  'codeSelector',
  'codeAddition',
  'codeDeletion',
  'url',
  'mark',
] as const;
export type InlineStyle = (typeof INLINE_STYLES)[number];

/** A block construct; every line it touches gets `style`. Blocks may nest (a heading in a quote). */
export interface BlockRange {
  from: number;
  to: number;
  style: BlockStyle;
}

/** A run of text with the same inline styles. Spans never overlap and are sorted by position. */
export interface Span {
  from: number;
  to: number;
  /** In `INLINE_STYLES` order. */
  styles: InlineStyle[];
}

/** A styled range of a code block's text, from a highlighter: offsets in that text. */
export interface CodeToken {
  from: number;
  to: number;
  style: InlineStyle;
}

/** The document text, for the styles that depend on more than the syntax tree. */
export interface StyleSource {
  /** Reads the document. With it, the TeX inside math gets its colors. */
  slice: (from: number, to: number) => string;
  /**
   * The colors of a fenced code block's text; `info` is what follows the opening fence
   * ("ts", "js title=x"). Undefined while they are not known: the block stays plain.
   */
  highlight?: (code: string, info: string) => readonly CodeToken[] | undefined;
}

export interface MarkdownStyles {
  blocks: BlockRange[];
  spans: Span[];
}

const BLOCK_NODES: Record<string, BlockStyle> = {
  ATXHeading1: 'h1',
  ATXHeading2: 'h2',
  ATXHeading3: 'h3',
  ATXHeading4: 'h4',
  ATXHeading5: 'h5',
  ATXHeading6: 'h6',
  SetextHeading1: 'h1',
  SetextHeading2: 'h2',
  FencedCode: 'codeblock',
  CodeBlock: 'codeblock',
  BlockMath: 'mathblock',
  Blockquote: 'quote',
  HorizontalRule: 'hr',
  Table: 'table',
  TableHeader: 'tableHeader',
};

const INLINE_NODES: Record<string, InlineStyle> = {
  StrongEmphasis: 'strong',
  Emphasis: 'em',
  Strikethrough: 'strike',
  InlineCode: 'code',
  InlineMath: 'math',
  Link: 'link',
  Image: 'link',
  Autolink: 'link',
  HeaderMark: 'mark',
  EmphasisMark: 'mark',
  StrikethroughMark: 'mark',
  CodeMark: 'mark',
  CodeInfo: 'mark',
  LinkMark: 'mark',
  LinkLabel: 'mark',
  LinkTitle: 'mark',
  QuoteMark: 'mark',
  ListMark: 'mark',
  TaskMarker: 'mark',
  TableDelimiter: 'mark',
  HorizontalRule: 'mark',
  MathMark: 'mark',
};

/** Where a URL is the target of a link (dimmed) rather than the visible text (a bare autolink). */
const LINK_TARGET_PARENTS = new Set(['Link', 'Image', 'LinkReference']);

function inlineStyle(node: SyntaxNodeRef): InlineStyle | undefined {
  if (node.name === 'URL') return LINK_TARGET_PARENTS.has(node.node.parent?.name ?? '') ? 'url' : 'link';
  return INLINE_NODES[node.name];
}

/**
 * The top-level block (a child of the document) at `pos`, or null between blocks. `side`
 * picks the block starting (1) or ending (-1) at `pos`.
 */
function topLevelBlock(tree: Tree, pos: number, side: 1 | -1): SyntaxNode | null {
  let node: SyntaxNode | null = tree.resolve(pos, side);
  while (node?.parent?.parent) node = node.parent;
  return node?.parent ? node : null;
}

/** The TeX of a math node as pieces of the document (without delimiters or quote markers). */
function mathPieces(node: SyntaxNode, slice: (from: number, to: number) => string): MathPiece[] {
  if (node.name === 'BlockMath') return node.getChildren('MathText').map((part) => ({ from: part.from, text: slice(part.from, part.to) }));
  const marks = node.getChildren('MathMark');
  return marks.length < 2 ? [] : [{ from: marks[0]!.to, text: slice(marks[0]!.to, marks[1]!.from) }];
}

/**
 * A fenced code block's colors in the document. Its text comes in pieces (CodeText nodes,
 * line breaks included) between quote markers and list indentation; tokens are cut to them.
 */
function codeTokens(node: SyntaxNode, { slice, highlight }: StyleSource): CodeToken[] {
  const info = node.getChild('CodeInfo');
  const pieces = node.getChildren('CodeText').map((part) => ({ from: part.from, text: slice(part.from, part.to) }));
  const tokens = pieces.length ? highlight?.(pieces.map((p) => p.text).join(''), info ? slice(info.from, info.to) : '') : undefined;
  if (!tokens) return [];
  const out: CodeToken[] = [];
  let start = 0;
  for (const piece of pieces) {
    const end = start + piece.text.length;
    for (const token of tokens) {
      const from = Math.max(token.from, start);
      const to = Math.min(token.to, end);
      if (from < to) out.push({ from: piece.from + from - start, to: piece.from + to - start, style: token.style });
    }
    start = end;
  }
  return out;
}

/**
 * Styles for the part of `tree` between `from` and `to` (a viewport). The range grows to whole
 * top-level blocks, so constructs that cross its edges keep both their markers. With `source`,
 * the TeX inside math and (with a highlighter) the code in fenced blocks get their colors.
 */
export function markdownStyles(tree: Tree, from = 0, to = tree.length, source?: StyleSource): MarkdownStyles {
  from = Math.min(from, topLevelBlock(tree, from, 1)?.from ?? from);
  to = Math.max(to, topLevelBlock(tree, to, -1)?.to ?? to);
  const blocks: BlockRange[] = [];
  const inline: { from: number; to: number; style: InlineStyle }[] = [];
  // Body rows of the current table; whole top-level blocks are walked, so no row is skipped.
  let tableRows = 0;
  tree.iterate({
    from,
    to,
    enter(node) {
      const block = BLOCK_NODES[node.name];
      if (block) blocks.push({ from: node.from, to: node.to, style: block });
      if (node.name === 'Table') tableRows = 0;
      if (node.name === 'TableRow' && ++tableRows % 2 === 0) blocks.push({ from: node.from, to: node.to, style: 'tableRowAlt' });
      if (source && (node.name === 'InlineMath' || node.name === 'BlockMath')) inline.push(...mathTokens(mathPieces(node.node, source.slice)));
      if (source?.highlight && node.name === 'FencedCode') inline.push(...codeTokens(node.node, source));
      // An escape is "\" plus the escaped character; only the backslash is syntax.
      if (node.name === 'Escape') {
        inline.push({ from: node.from, to: node.from + 1, style: 'mark' });
        return;
      }
      const style = inlineStyle(node);
      if (style && node.to > node.from) inline.push({ from: node.from, to: node.to, style });
    },
  });
  return { blocks, spans: flattenSpans(inline) };
}

/** Overlapping styled ranges as sorted, non-overlapping spans; equal neighbours are merged. */
export function flattenSpans(ranges: readonly { from: number; to: number; style: InlineStyle }[]): Span[] {
  const events: { pos: number; index: number; delta: 1 | -1 }[] = [];
  for (const r of ranges) {
    if (r.to <= r.from) continue;
    const index = INLINE_STYLES.indexOf(r.style);
    events.push({ pos: r.from, index, delta: 1 }, { pos: r.to, index, delta: -1 });
  }
  events.sort((a, b) => a.pos - b.pos);
  const counts = new Array<number>(INLINE_STYLES.length).fill(0);
  const spans: Span[] = [];
  let i = 0;
  while (i < events.length) {
    const pos = events[i]!.pos;
    for (; i < events.length && events[i]!.pos === pos; i++) counts[events[i]!.index]! += events[i]!.delta;
    if (i === events.length) break;
    const styles = INLINE_STYLES.filter((_, k) => counts[k]! > 0);
    if (!styles.length) continue;
    const end = events[i]!.pos;
    const last = spans.at(-1);
    if (last && last.to === pos && sameStyles(last.styles, styles)) last.to = end;
    else spans.push({ from: pos, to: end, styles });
  }
  return spans;
}

function sameStyles(a: readonly InlineStyle[], b: readonly InlineStyle[]): boolean {
  return a.length === b.length && a.every((s, k) => s === b[k]);
}
