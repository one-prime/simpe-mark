// Lays out Markdown for drawing on a canvas, with the same styling as the editor: markers
// stay visible (dimmed), headings are bigger, code and tables are monospace, images and $$
// math are boxes below their lines. No DOM: text widths come from the host's `measure`.

import {
  charWidth,
  defaultTheme,
  markdownParser,
  markdownStyles,
  previewBlocks,
  resolveLineLook,
  resolveLook,
  STROKES,
  type BlockStyle,
  type InlineStyle,
  type Look,
  type Theme,
} from '@simple-mark/model';

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  /** 100–900, as in CSS. */
  fontWeight: number;
  /** Line spacing as a multiple of the font size. */
  lineHeight: number;
  /** Color of text that has no style of its own. */
  color: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface Size {
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** Wrap width; Infinity keeps the text's own lines (automatic width). */
  width: number;
  style: TextStyle;
  theme?: Theme;
  /** Width of `text` drawn in `font` (a CSS font string, as for `ctx.font`). */
  measure: (text: string, font: string) => number;
  /** Natural size of an image (path as written): null if it can't load, undefined while loading. */
  imageSize?: (src: string) => Size | null | undefined;
  /**
   * Size of rendered display math in em of `fontFamily` (see `createMathImages`): null if it
   * has an error, undefined while rendering.
   */
  mathSize?: (tex: string, fontFamily: string) => Size | null | undefined;
}

/** A piece of text in one style. `top` is the top of its line box; text is drawn from `textTop`. */
export interface TextRun {
  text: string;
  x: number;
  width: number;
  top: number;
  height: number;
  textTop: number;
  font: string;
  /**
   * The line's own font (without inline styles). Its metrics give the baseline every run on the
   * line sits on, as in a browser, where inline code in another font shares the line's baseline.
   */
  lineFont: string;
  fontSize: number;
  color: string;
  /** Behind this text only (inline code); neighbouring runs with the same one share a box. */
  background?: string;
  /** Corner radius of that box. */
  radius?: number;
  strike?: boolean;
  underline?: boolean;
  /** Draw character by character on a grid of this column width (tables), wide ones in two columns. */
  column?: number;
}

/** A line's full-width background, bar or lines (code blocks, table rows, quotes, headings, rules). */
export interface LineDecoration {
  top: number;
  height: number;
  background?: string;
  /** Corner radii of the background: top (first line of a code block) and bottom (last line). */
  radius?: { top: number; bottom: number };
  /** A bar along the left edge: its color and width. */
  bar?: { color: string; width: number };
  /** A line along the bottom edge (under h1, h2). */
  border?: { color: string; width: number };
  /** A line across the middle (horizontal rules). */
  rule?: { color: string; width: number };
}

export interface ImageBox {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Path as written; null when a reference has no definition. */
  src: string | null;
  alt: string;
  raw: string;
  status: 'ready' | 'loading' | 'missing';
}

export interface MathBox {
  kind: 'math';
  x: number;
  y: number;
  width: number;
  height: number;
  tex: string;
  status: 'ready' | 'loading' | 'error';
}

export interface MarkdownLayout {
  width: number;
  height: number;
  runs: TextRun[];
  lines: LineDecoration[];
  boxes: (ImageBox | MathBox)[];
  /** For placeholders and messages: the plain text font and colors. */
  message: { font: string; dim: string; error: string };
}

/** Editor sizes in em, so a canvas text at any font size looks like the editor at 15px. */
const EM = {
  previewTop: 4 / 15,
  previewBottom: 8 / 15,
  imageMaxHeight: 320 / 15,
  imageGap: 8 / 15,
};

const ERROR_COLOR = '#cf222e';

/** Characters a line may break between, like CJK in the browser (no spaces needed). */
const BREAK_ANYWHERE = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-힯豈-﫿＀-￯]/;

function fontOf(look: Look, style: TextStyle, theme: Theme, scale: number): string {
  const family = look.monospace ? theme.monospaceFamily : style.fontFamily;
  return `${look.italic ? 'italic ' : ''}${look.fontWeight ?? style.fontWeight} ${style.fontSize * scale}px ${family}`;
}

/** Words, spaces, and single characters that may break anywhere. */
function tokens(text: string): string[] {
  const out: string[] = [];
  let word = '';
  for (const ch of text) {
    const space = ch === ' ' || ch === '\t';
    if (BREAK_ANYWHERE.test(ch)) {
      if (word) out.push(word);
      out.push(ch);
      word = '';
    } else if (space !== (word.length > 0 && (word[0] === ' ' || word[0] === '\t'))) {
      if (word) out.push(word);
      word = ch;
    } else word += ch;
  }
  if (word) out.push(word);
  return out;
}

interface Piece {
  text: string;
  width: number;
  styles: InlineStyle[];
}

export function layoutMarkdown(source: string, options: LayoutOptions): MarkdownLayout {
  const theme = options.theme ?? defaultTheme;
  const { style, measure } = options;
  // One character per line break, so offsets match the parser's positions.
  const text = source.replace(/\r\n?/g, '\n');
  const tree = markdownParser.parse(text);
  const { blocks, spans } = markdownStyles(tree);

  const lineStarts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  const isLineStart = new Set(lineStarts);
  const lineEndOf = (n: number) => (n + 1 < lineStarts.length ? lineStarts[n + 1]! - 1 : text.length);
  const lineOf = (pos: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  // Block styles of each line, and the styles whose block starts or ends there.
  const lineBlocks = lineStarts.map(() => ({ styles: new Set<BlockStyle>(), first: new Set<BlockStyle>(), last: new Set<BlockStyle>() }));
  for (const block of blocks) {
    let end = block.to;
    if (end > block.from && isLineStart.has(end)) end--;
    const first = lineOf(block.from);
    const last = lineOf(end);
    for (let n = first; n <= last; n++) lineBlocks[n]!.styles.add(block.style);
    lineBlocks[first]!.first.add(block.style);
    lineBlocks[last]!.last.add(block.style);
  }
  // Previews below each line.
  const previews = new Map<number, ReturnType<typeof previewBlocks>>();
  for (const preview of previewBlocks(tree, text)) {
    const n = lineOf(preview.at);
    previews.set(n, [...(previews.get(n) ?? []), preview]);
  }

  const wrapWidth = options.width;
  const runs: TextRun[] = [];
  /** The inline styles of each run (pieces join a run only when they come from the same span). */
  const runStyles: InlineStyle[][] = [];
  const lines: LineDecoration[] = [];
  const boxes: (ImageBox | MathBox)[] = [];
  /** Visual lines, for alignment: [first run, last run, width]. */
  const rows: [number, number, number][] = [];
  let y = 0;
  let maxWidth = 0;
  let spanIndex = 0;

  for (let n = 0; n < lineStarts.length; n++) {
    const from = lineStarts[n]!;
    const to = lineEndOf(n);
    const styles = [...lineBlocks[n]!.styles];
    const lineLook = resolveLineLook(styles, theme, lineBlocks[n]!);
    const scale = lineLook.fontScale ?? 1;
    const lineHeight = style.lineHeight * style.fontSize * scale;
    const textTop = (lineHeight - style.fontSize * scale) / 2;
    const indent = (lineLook.indent ?? 0) * style.fontSize;
    const lineFont = fontOf(resolveLook(styles, [], theme), style, theme, scale);
    const table = styles.includes('table');
    const available = wrapWidth - indent;

    // The line's text as pieces with their inline styles.
    const pieces: Piece[] = [];
    const pushText = (part: string, inline: InlineStyle[]) => {
      if (!part) return;
      const look = resolveLook(styles, inline, theme);
      const font = fontOf(look, style, theme, scale);
      const column = table ? measure('0', font) : 0;
      for (const token of tokens(part)) {
        let width = 0;
        if (table) for (const ch of token) width += charWidth(ch.codePointAt(0)!) * column;
        else width = measure(token, font);
        pieces.push({ text: token, width, styles: inline });
      }
    };
    while (spanIndex < spans.length && spans[spanIndex]!.to <= from) spanIndex++;
    let pos = from;
    for (let k = spanIndex; k < spans.length && spans[k]!.from < to; k++) {
      const span = spans[k]!;
      pushText(text.slice(pos, Math.max(pos, span.from)), []);
      pushText(text.slice(Math.max(pos, span.from), Math.min(span.to, to)), span.styles);
      pos = Math.min(span.to, to);
    }
    pushText(text.slice(pos, to), []);

    // Greedy wrapping: break before a piece that doesn't fit; break long pieces by character.
    const visual: Piece[][] = [[]];
    let x = 0;
    const newLine = () => {
      visual.push([]);
      x = 0;
    };
    for (const piece of pieces) {
      const isSpace = /^[ \t]+$/.test(piece.text);
      if (x + piece.width > available && x > 0) {
        if (isSpace) {
          newLine();
          continue; // the space where a line breaks is not carried over
        }
        newLine();
      }
      if (piece.width > available && piece.text.length > 1 && !isSpace) {
        // A word longer than the line: split it by character.
        const chars = Array.from(piece.text);
        const each = piece.width / chars.length;
        let part = '';
        for (const ch of chars) {
          if (x + (part.length + 1) * each > available && (x > 0 || part)) {
            if (part) visual.at(-1)!.push({ text: part, width: Array.from(part).length * each, styles: piece.styles });
            newLine();
            part = '';
          }
          part += ch;
        }
        if (part) {
          const width = Array.from(part).length * each;
          visual.at(-1)!.push({ text: part, width, styles: piece.styles });
          x += width;
        }
        continue;
      }
      visual.at(-1)!.push(piece);
      x += piece.width;
    }

    // Runs: neighbouring pieces with the same styles become one run.
    for (const [r, row] of visual.entries()) {
      const first = runs.length;
      let rx = indent;
      for (const piece of row) {
        const last = runs.length > first ? runs.at(-1)! : null;
        if (last && runStyles.at(-1) === piece.styles) {
          last.text += piece.text;
          last.width += piece.width;
        } else {
          const look = resolveLook(styles, piece.styles, theme);
          const font = fontOf(look, style, theme, scale);
          runs.push({
            text: piece.text,
            x: rx,
            width: piece.width,
            top: y,
            height: lineHeight,
            textTop: y + textTop,
            font,
            lineFont,
            fontSize: style.fontSize * scale,
            color: look.color ?? style.color,
            ...(look.background ? { background: look.background } : {}),
            ...(look.background && look.radius ? { radius: look.radius * style.fontSize * scale } : {}),
            ...(look.strike ? { strike: true } : {}),
            ...(look.underline ? { underline: true } : {}),
            ...(table ? { column: measure('0', font) } : {}),
          });
          runStyles.push(piece.styles);
        }
        rx += piece.width;
      }
      rows.push([first, runs.length, rx]);
      maxWidth = Math.max(maxWidth, rx);
      // Corners and the bottom border belong to the first and last visual line of a wrapped line.
      const radiusTop = r === 0 ? (lineLook.radiusTop ?? 0) * style.fontSize : 0;
      const radiusBottom = r === visual.length - 1 ? (lineLook.radiusBottom ?? 0) * style.fontSize : 0;
      const border = r === visual.length - 1 ? lineLook.borderBottom : undefined;
      if (lineLook.lineBackground || lineLook.borderLeft || border || lineLook.rule) {
        lines.push({
          top: y,
          height: lineHeight,
          ...(lineLook.lineBackground ? { background: lineLook.lineBackground } : {}),
          ...(lineLook.lineBackground && (radiusTop || radiusBottom) ? { radius: { top: radiusTop, bottom: radiusBottom } } : {}),
          ...(lineLook.borderLeft ? { bar: { color: lineLook.borderLeft, width: STROKES.bar * style.fontSize } } : {}),
          ...(border ? { border: { color: border, width: STROKES.border * style.fontSize } } : {}),
          ...(lineLook.rule ? { rule: { color: lineLook.rule, width: STROKES.rule * style.fontSize } } : {}),
        });
      }
      y += lineHeight;
    }

    // Previews below the line.
    for (const preview of previews.get(n) ?? []) {
      const top = y + EM.previewTop * style.fontSize;
      if ('tex' in preview) {
        const size = options.mathSize?.(preview.tex, style.fontFamily);
        const width = size ? size.width * style.fontSize : 0;
        const height = size ? size.height * style.fontSize : size === null ? style.lineHeight * style.fontSize : 3 * style.lineHeight * style.fontSize;
        boxes.push({ kind: 'math', x: 0, y: top, width, height, tex: preview.tex, status: size ? 'ready' : size === null ? 'error' : 'loading' });
        maxWidth = Math.max(maxWidth, width);
        y = top + height + EM.previewBottom * style.fontSize;
        continue;
      }
      // Images in a row, wrapping like the editor's flex row; never enlarged, at most
      // EM.imageMaxHeight tall, and no wider than the wrap width.
      const gap = EM.imageGap * style.fontSize;
      const maxHeight = EM.imageMaxHeight * style.fontSize;
      let rowX = 0;
      let rowHeight = 0;
      let rowTop = top;
      for (const image of preview.images) {
        const natural = image.src === null ? null : options.imageSize?.(image.src);
        let width: number;
        let height: number;
        if (natural) {
          const scale = Math.min(1, maxHeight / natural.height, wrapWidth === Infinity ? 1 : wrapWidth / natural.width);
          width = natural.width * scale;
          height = natural.height * scale;
        } else {
          // Missing: a line for the message. Loading: a placeholder until the size is known.
          width = wrapWidth === Infinity ? 10 * style.fontSize : wrapWidth;
          height = natural === null ? style.lineHeight * style.fontSize : maxHeight / 2;
        }
        if (rowX > 0 && rowX + gap + width > wrapWidth) {
          rowTop += rowHeight + gap;
          rowX = 0;
          rowHeight = 0;
        }
        const x = rowX + (rowX > 0 ? gap : 0);
        boxes.push({ kind: 'image', x, y: rowTop, width, height, src: image.src, alt: image.alt, raw: image.raw, status: natural ? 'ready' : natural === null ? 'missing' : 'loading' });
        rowX = x + width;
        rowHeight = Math.max(rowHeight, height);
        maxWidth = Math.max(maxWidth, rowX);
      }
      y = rowTop + rowHeight + EM.previewBottom * style.fontSize;
    }
  }

  // Alignment moves whole visual lines; math is centered, images stay at the left like in the editor.
  const width = wrapWidth === Infinity ? maxWidth : wrapWidth;
  const align = style.textAlign ?? 'left';
  if (align !== 'left') {
    for (const [first, last, rowWidth] of rows) {
      const shift = align === 'center' ? (width - rowWidth) / 2 : width - rowWidth;
      for (let i = first; i < last; i++) runs[i]!.x += shift;
    }
  }
  for (const box of boxes) if (box.kind === 'math') box.x = (width - box.width) / 2;

  const message = { font: fontOf({}, style, theme, 0.85), dim: theme.inline.mark.color ?? '#8c959f', error: ERROR_COLOR };
  return { width, height: y, runs, lines, boxes, message };
}
