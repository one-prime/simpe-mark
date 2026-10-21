// How each style looks, as plain data. The CodeMirror editor turns it into CSS; a canvas
// renderer reads it through resolveLook/resolveLineLook. Both apply looks in the order of
// BLOCK_STYLES then INLINE_STYLES, so a property set by a later style wins in both.
//
// The default theme follows GitHub's Markdown styles (github-markdown-css, light): sizes in
// em are GitHub's, converted where GitHub uses pixels at its 16px text.

import { BLOCK_STYLES, INLINE_STYLES, type BlockStyle, type InlineStyle } from './styles';

/** Text properties. Unset properties are inherited (from the line, then the base text). */
export interface Look {
  /** Font size relative to the base size (1 = unchanged). Meant for block styles. */
  fontScale?: number;
  /** 100–900, as in CSS. */
  fontWeight?: number;
  italic?: boolean;
  monospace?: boolean;
  color?: string;
  /** Behind the styled text only (e.g. inline code). */
  background?: string;
  /** Corner radius of `background`, in em of the line's font. */
  radius?: number;
  strike?: boolean;
  underline?: boolean;
}

/** Properties of whole lines. */
export interface LineLook extends Look {
  /** Behind the full width of the line (e.g. code blocks). */
  lineBackground?: string;
  /** Corner radius of the block's `lineBackground` (top of its first line, bottom of its last), in em. */
  lineRadius?: number;
  /** A bar along the left edge of the line (e.g. quotes), `STROKES.bar` wide. */
  borderLeft?: string;
  /** Space before the text, in em of the base font. Nested blocks add up (code in a quote). */
  indent?: number;
  /** A line under the block's last line (h1, h2), `STROKES.border` thick. */
  borderBottom?: string;
  /** A line across the middle of the line (horizontal rules), `STROKES.rule` thick. */
  rule?: string;
}

/** A line's look with its blocks' edges applied: `lineRadius` becomes the corners this line rounds. */
export interface ResolvedLineLook extends Omit<LineLook, 'lineRadius'> {
  radiusTop?: number;
  radiusBottom?: number;
}

/** Which of a line's blocks start and end on it. */
export interface BlockEdges {
  first: Iterable<BlockStyle>;
  last: Iterable<BlockStyle>;
}

/** Widths of bars and lines, in em of the base font (1px and 4px at 16px, as GitHub). */
export const STROKES = { bar: 0.25, border: 1 / 16, rule: 0.25 } as const;

export interface Theme {
  fontFamily: string;
  monospaceFamily: string;
  color: string;
  block: Record<BlockStyle, LineLook>;
  inline: Record<InlineStyle, Look>;
}

const muted = '#59636e';
const border = '#d1d9e0';
const subtleBorder = '#d1d9e0b3';
const codeBackground = '#f6f8fa';

export const defaultTheme: Theme = {
  fontFamily: 'system-ui, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif',
  // Fonts with CJK glyphs exactly twice as wide as Latin ones come first, so padded tables
  // line up with Korean text; a Latin-only font would mix in a CJK fallback of another width.
  monospaceFamily: '"D2Coding", "Noto Sans Mono CJK KR", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  color: '#1f2328',
  block: {
    quote: { color: muted, borderLeft: border, indent: 1 },
    codeblock: { monospace: true, lineBackground: codeBackground, lineRadius: 6 / 16, indent: 1 },
    mathblock: { monospace: true },
    table: { monospace: true },
    tableHeader: { fontWeight: 600 },
    tableRowAlt: { lineBackground: codeBackground },
    hr: { rule: border },
    h1: { fontScale: 2, fontWeight: 600, borderBottom: subtleBorder },
    h2: { fontScale: 1.5, fontWeight: 600, borderBottom: subtleBorder },
    h3: { fontScale: 1.25, fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontScale: 0.875, fontWeight: 600 },
    h6: { fontScale: 0.85, fontWeight: 600, color: muted },
  },
  inline: {
    link: { color: '#0969da' },
    strong: { fontWeight: 600 },
    em: { italic: true },
    strike: { strike: true },
    code: { monospace: true, background: '#818b981f', radius: 6 / 16 },
    math: { monospace: true },
    // TeX: commands in GitHub's constant blue; brackets in VS Code's light bracket pair colors.
    mathCommand: { color: '#0550ae' },
    mathComment: { color: muted, italic: true },
    mathBracket1: { color: '#0431fa' },
    mathBracket2: { color: '#319331' },
    mathBracket3: { color: '#7b3814' },
    mathBracketError: { color: '#ff1212cc' },
    url: { color: '#8c959f', underline: true },
    mark: { color: '#8c959f', fontWeight: 400, italic: false, strike: false, underline: false },
  },
};

/**
 * The look of a line with these block styles (any order). `edges` tells which blocks start and
 * end on the line (for corners and bottom borders); without it every block is one line long.
 */
export function resolveLineLook(blocks: Iterable<BlockStyle>, theme: Theme = defaultTheme, edges?: BlockEdges): ResolvedLineLook {
  const present = new Set(blocks);
  const first = edges ? new Set(edges.first) : present;
  const last = edges ? new Set(edges.last) : present;
  const look: ResolvedLineLook = {};
  let indent = 0;
  for (const style of BLOCK_STYLES) {
    if (!present.has(style)) continue;
    const { lineRadius, borderBottom, indent: own, ...rest } = theme.block[style];
    Object.assign(look, rest);
    indent += own ?? 0;
    if (borderBottom !== undefined && last.has(style)) look.borderBottom = borderBottom;
    // Corners belong to the block whose background the line shows.
    if (rest.lineBackground !== undefined) {
      delete look.radiusTop;
      delete look.radiusBottom;
      if (lineRadius && first.has(style)) look.radiusTop = lineRadius;
      if (lineRadius && last.has(style)) look.radiusBottom = lineRadius;
    }
  }
  if (indent) look.indent = indent;
  return look;
}

/** The look of text with these block and inline styles (any order). */
export function resolveLook(blocks: Iterable<BlockStyle>, inline: Iterable<InlineStyle>, theme: Theme = defaultTheme): Look {
  const {
    lineBackground: _bg,
    borderLeft: _bar,
    indent: _indent,
    borderBottom: _border,
    rule: _rule,
    radiusTop: _top,
    radiusBottom: _bottom,
    ...look
  } = resolveLineLook(blocks, theme);
  const present = new Set(inline);
  for (const style of INLINE_STYLES) if (present.has(style)) Object.assign(look, theme.inline[style]);
  return look;
}
