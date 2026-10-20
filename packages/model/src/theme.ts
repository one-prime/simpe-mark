// How each style looks, as plain data. The CodeMirror editor turns it into CSS; a canvas
// renderer reads it through resolveLook/resolveLineLook. Both apply looks in the order of
// BLOCK_STYLES then INLINE_STYLES, so a property set by a later style wins in both.

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
  strike?: boolean;
  underline?: boolean;
}

/** Properties of whole lines. */
export interface LineLook extends Look {
  /** Behind the full width of the line (e.g. code blocks). */
  lineBackground?: string;
  /** A bar along the left edge of the line (e.g. quotes). */
  borderLeft?: string;
}

export interface Theme {
  fontFamily: string;
  monospaceFamily: string;
  color: string;
  block: Record<BlockStyle, LineLook>;
  inline: Record<InlineStyle, Look>;
}

export const defaultTheme: Theme = {
  fontFamily: 'system-ui, -apple-system, "Segoe UI", "Noto Sans KR", sans-serif',
  // Fonts with CJK glyphs exactly twice as wide as Latin ones come first, so padded tables
  // line up with Korean text; a Latin-only font would mix in a CJK fallback of another width.
  monospaceFamily: '"D2Coding", "Noto Sans Mono CJK KR", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  color: '#1f2328',
  block: {
    quote: { color: '#59636e', borderLeft: '#d1d9e0' },
    codeblock: { monospace: true, lineBackground: '#f6f8fa' },
    mathblock: { monospace: true, color: '#6639ba' },
    table: { monospace: true },
    tableHeader: { fontWeight: 700 },
    tableRowAlt: { lineBackground: '#f6f8fa' },
    hr: {},
    h1: { fontScale: 1.6, fontWeight: 700 },
    h2: { fontScale: 1.4, fontWeight: 700 },
    h3: { fontScale: 1.2, fontWeight: 700 },
    h4: { fontScale: 1.1, fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700, color: '#59636e' },
  },
  inline: {
    link: { color: '#0969da' },
    strong: { fontWeight: 700 },
    em: { italic: true },
    strike: { strike: true },
    code: { monospace: true, background: 'rgba(129, 139, 152, 0.15)' },
    math: { monospace: true, color: '#6639ba' },
    url: { color: '#8c959f', underline: true },
    mark: { color: '#8c959f', fontWeight: 400, italic: false, strike: false, underline: false },
  },
};

/** The look of a line with these block styles (any order). */
export function resolveLineLook(blocks: Iterable<BlockStyle>, theme: Theme = defaultTheme): LineLook {
  const present = new Set(blocks);
  const look: LineLook = {};
  for (const style of BLOCK_STYLES) if (present.has(style)) Object.assign(look, theme.block[style]);
  return look;
}

/** The look of text with these block and inline styles (any order). */
export function resolveLook(blocks: Iterable<BlockStyle>, inline: Iterable<InlineStyle>, theme: Theme = defaultTheme): Look {
  const { lineBackground: _bg, borderLeft: _border, ...look }: LineLook = resolveLineLook(blocks, theme);
  const present = new Set(inline);
  for (const style of INLINE_STYLES) if (present.has(style)) Object.assign(look, theme.inline[style]);
  return look;
}
