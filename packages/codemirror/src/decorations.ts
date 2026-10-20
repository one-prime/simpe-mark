// Turns the model's styles into CodeMirror decorations for the visible part of the document.
// Looks come from the model's resolveLook/resolveLineLook, the same functions a canvas
// renderer uses, so the editor and the canvas cannot disagree. Classes (sm-strong, sm-line-h1)
// are added as well, for host CSS and tests.

import { syntaxTree } from '@codemirror/language';
import { Facet, type Range } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { defaultTheme, markdownStyles, resolveLineLook, resolveLook, type BlockStyle, type InlineStyle, type LineLook, type Theme } from '@simplemark/model';

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

class MarkdownDecorations {
  decorations: DecorationSet;
  private theme: Theme;
  private cache = new Map<string, Decoration>();

  constructor(view: EditorView) {
    this.theme = view.state.facet(markdownTheme);
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate): void {
    const theme = update.state.facet(markdownTheme);
    if (theme !== this.theme) {
      this.theme = theme;
      this.cache.clear();
    } else if (!update.docChanged && !update.viewportChanged && syntaxTree(update.state) === syntaxTree(update.startState)) {
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
    return Decoration.set(ranges, true);
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
      deco = Decoration.mark({
        class: styles.map((s) => `sm-${s}`).join(' '),
        attributes: { style: lookCss(resolveLook([], styles, this.theme), this.theme) },
      });
      this.cache.set(key, deco);
    }
    return deco;
  }
}

/** Styles the visible Markdown from the syntax tree; never hides or replaces text. */
export const markdownDecorations = ViewPlugin.fromClass(MarkdownDecorations, { decorations: (plugin) => plugin.decorations });
