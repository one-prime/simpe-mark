// Turns the model's styles into CodeMirror decorations for the visible part of the document.
// Looks come from the model's resolveLook/resolveLineLook, the same functions a canvas
// renderer uses, so the editor and the canvas cannot disagree. Classes (sm-strong, sm-line-h1)
// are added as well, for host CSS and tests.

import { syntaxTree } from '@codemirror/language';
import { Facet, type EditorState, type Line, type Range } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { followKeyName } from './links';
import { charWidth, defaultTheme, markdownStyles, resolveLineLook, resolveLook, type BlockStyle, type InlineStyle, type LineLook, type Theme } from '@simple-mark/model';

/** The theme the editor draws with. */
export const markdownTheme = Facet.define<Theme, Theme>({ combine: (values) => values[0] ?? defaultTheme });

/** A look as an inline CSS declaration list. */
export function lookCss(look: LineLook, theme: Theme): string {
  const css: string[] = [];
  if (look.fontScale !== undefined) css.push(`font-size: ${look.fontScale}em`);
  if (look.fontWeight !== undefined) css.push(`font-weight: ${look.fontWeight}`);
  if (look.italic !== undefined) css.push(`font-style: ${look.italic ? 'italic' : 'normal'}`);
  if (look.monospace !== undefined) css.push(`font-family: ${look.monospace ? theme.monospaceFamily : theme.fontFamily}`);
  if (look.color !== undefined) css.push(`color: ${look.color}`);
  if (look.background !== undefined) css.push(`background-color: ${look.background}`);
  if (look.strike !== undefined || look.underline !== undefined) {
    const lines = [look.strike && 'line-through', look.underline && 'underline'].filter(Boolean);
    css.push(`text-decoration: ${lines.join(' ') || 'none'}`);
  }
  if (look.lineBackground !== undefined) css.push(`background-color: ${look.lineBackground}`);
  // An inset shadow draws the bar without changing the line's width.
  if (look.borderLeft !== undefined) css.push(`box-shadow: inset 3px 0 0 ${look.borderLeft}`, 'padding-left: 12px');
  return css.join('; ');
}

const fontChecks = new Map<string, boolean>();

/**
 * Whether `family` draws CJK characters exactly two columns wide. When a Latin-only monospace
 * font falls back to a CJK font of another width, padded tables would not line up.
 */
function cjkFitsColumns(family: string): boolean {
  let fits = fontChecks.get(family);
  if (fits === undefined) {
    const ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (!ctx) return true;
    ctx.font = `20px ${family}`;
    const column = ctx.measureText('0').width;
    fits = ['가', '中', 'あ'].every((ch) => Math.abs(ctx.measureText(ch).width - 2 * column) < 0.5);
    fontChecks.set(family, fits);
  }
  return fits;
}

const headingText = Decoration.mark({ class: 'sm-heading-text' });

/** The lines holding a cursor, as a comparable string. */
function cursorLinesKey(state: EditorState): string {
  return state.selection.ranges.map((r) => state.doc.lineAt(r.head).from).join(',');
}

class MarkdownDecorations {
  decorations: DecorationSet;
  private theme: Theme;
  private fixWide: boolean;
  private cache = new Map<string, Decoration>();

  constructor(view: EditorView) {
    this.theme = view.state.facet(markdownTheme);
    this.fixWide = !cjkFitsColumns(this.theme.monospaceFamily);
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate): void {
    const theme = update.state.facet(markdownTheme);
    if (theme !== this.theme) {
      this.theme = theme;
      this.fixWide = !cjkFitsColumns(theme.monospaceFamily);
      this.cache.clear();
    } else if (
      !update.docChanged &&
      !update.viewportChanged &&
      syntaxTree(update.state) === syntaxTree(update.startState) &&
      !(this.fixWide && update.selectionSet && cursorLinesKey(update.state) !== cursorLinesKey(update.startState))
    ) {
      return;
    }
    this.decorations = this.build(update.view);
  }

  private build(view: EditorView): DecorationSet {
    const { doc } = view.state;
    const { from, to } = view.viewport;
    const { blocks, spans } = markdownStyles(syntaxTree(view.state), from, to);

    const lines = new Map<number, Set<BlockStyle>>();
    for (const block of blocks) {
      const start = Math.max(block.from, from);
      let end = Math.min(block.to, to);
      // A block ending right after a line break does not reach the next line.
      if (end > start && doc.lineAt(end).from === end) end--;
      for (let pos = start; pos <= end; ) {
        const line = doc.lineAt(pos);
        let styles = lines.get(line.from);
        if (!styles) lines.set(line.from, (styles = new Set()));
        styles.add(block.style);
        pos = line.to + 1;
      }
    }

    const ranges: Range<Decoration>[] = [];
    for (const [lineFrom, styles] of lines) ranges.push(this.lineDecoration([...styles]).range(lineFrom));
    for (const span of spans) ranges.push(this.markDecoration(span.styles).range(span.from, span.to));
    // CodeMirror learns the normal line height from the first short line of plain text it finds
    // on screen. The text line of a setext heading ("Title" above "---") is plain text in a
    // bigger font, which made every off-screen line estimated 1.4× too tall. Wrapping it in a
    // span makes CodeMirror skip it.
    for (const [lineFrom, styles] of lines) {
      const line = doc.lineAt(lineFrom);
      if (line.length && [...styles].some((s) => /^h[1-6]$/.test(s))) ranges.push(headingText.range(line.from, line.to));
    }
    if (this.fixWide) {
      // Not on lines with a cursor: wrapping text in boxes while an IME composes there makes
      // the browser (Firefox with a Korean IME) drop the composed text onto a stray line. The
      // row being typed in is re-aligned on Tab/Enter anyway.
      const cursorLines = new Set(view.state.selection.ranges.map((r) => doc.lineAt(r.head).from));
      for (const [lineFrom, styles] of lines) {
        if (styles.has('table') && !cursorLines.has(lineFrom)) this.wideRuns(doc.lineAt(lineFrom), ranges);
      }
    }
    return Decoration.set(ranges, true);
  }

  /** Draws runs of wide characters exactly two columns each, so table pipes line up. */
  private wideRuns(line: Line, ranges: Range<Decoration>[]): void {
    let start = -1;
    let columns = 0;
    const flush = (end: number) => {
      if (start < 0) return;
      const key = `wide:${columns}`;
      let deco = this.cache.get(key);
      if (!deco) {
        deco = Decoration.mark({ class: 'sm-wide', attributes: { style: `display: inline-block; width: ${columns}ch; text-align: center` } });
        this.cache.set(key, deco);
      }
      ranges.push(deco.range(line.from + start, line.from + end));
      start = -1;
      columns = 0;
    };
    let i = 0;
    for (const ch of line.text) {
      if (charWidth(ch.codePointAt(0)!) === 2) {
        if (start < 0) start = i;
        columns += 2;
      } else flush(i);
      i += ch.length;
    }
    flush(i);
  }

  private lineDecoration(styles: BlockStyle[]): Decoration {
    const key = `line:${styles.sort().join(' ')}`;
    let deco = this.cache.get(key);
    if (!deco) {
      deco = Decoration.line({
        class: styles.map((s) => `sm-line-${s}`).join(' '),
        attributes: { style: lookCss(resolveLineLook(styles, this.theme), this.theme) },
      });
      this.cache.set(key, deco);
    }
    return deco;
  }

  private markDecoration(styles: InlineStyle[]): Decoration {
    const key = `mark:${styles.join(' ')}`;
    let deco = this.cache.get(key);
    if (!deco) {
      // Line properties come from the line decoration; spans only set what they change.
      const linked = styles.includes('link') || styles.includes('url');
      deco = Decoration.mark({
        class: styles.map((s) => `sm-${s}`).join(' '),
        attributes: {
          style: lookCss(resolveLook([], styles, this.theme), this.theme),
          ...(linked ? { title: `${followKeyName}+Click to open` } : {}),
        },
      });
      this.cache.set(key, deco);
    }
    return deco;
  }
}

/** Styles the visible Markdown from the syntax tree; never hides or replaces text. */
export const markdownDecorations = ViewPlugin.fromClass(MarkdownDecorations, { decorations: (plugin) => plugin.decorations });
