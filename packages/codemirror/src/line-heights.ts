// Height estimates for text lines that are not drawn yet. CodeMirror estimates a line as
// (characters ÷ characters per line) lines, measuring characters on Latin text: headings
// (bigger font) and wide characters (Korean: twice as wide) come out too short — a Korean
// paragraph drawn on two lines was estimated at one — and the scrollbar drifted on the first
// pass through a document.
//
// CodeMirror takes the larger of its own guess and the `estimatedHeight` of widgets on a line,
// so headings and wrapping lines get an invisible marker widget carrying a better estimate:
// the line's text width in its real font, wrapped at the editor's width. Drawn lines are
// measured by CodeMirror itself, so the estimate only matters off screen.
//
// No marker on a line with a cursor (no DOM change where an IME composes), and markers on
// screen are never redrawn (`updateDOM`), only their estimate changes.

import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { Theme } from '@simple-mark/model';
import { markdownTheme } from './decorations';
import { layoutFacts, refreshEstimates } from './preview-heights';

class HeightHint extends WidgetType {
  constructor(readonly height: number) {
    super();
  }

  override eq(other: HeightHint): boolean {
    return other.height === this.height;
  }

  override updateDOM(): boolean {
    return true;
  }

  override get estimatedHeight(): number {
    return this.height;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'sm-height-hint';
    span.style.display = 'none';
    return span;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

let context: CanvasRenderingContext2D | null | undefined;

function measureContext(): CanvasRenderingContext2D | null {
  if (context === undefined) context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  return context;
}

const HEADING = /^ {0,3}(#{1,6})(?:\s|$)/;

/** Estimated drawn height of a line, or 0 when CodeMirror's own one-line guess is right. */
export function lineEstimate(text: string, theme: Theme): number {
  const heading = HEADING.exec(text);
  if (!heading && text.length < 16) return 0;
  const ctx = measureContext();
  if (!ctx) return 0;
  const facts = layoutFacts();
  const look = heading ? theme.block[`h${heading[1]!.length}` as 'h1'] : undefined;
  const scale = look?.fontScale ?? 1;
  ctx.font = `${look?.fontWeight ?? 400} ${facts.fontSize * scale}px ${facts.fontFamily}`;
  // Wrapping breaks between words, so lines are not filled to the very end.
  const lines = Math.max(1, Math.ceil(ctx.measureText(text).width / (facts.contentWidth * 0.97)));
  const height = Math.round(lines * facts.lineHeight * scale);
  return height > facts.lineHeight + 1 ? height : 0;
}

function hintAt(state: EditorState, lineNumber: number, theme: Theme): Range<Decoration> | null {
  const line = state.doc.line(lineNumber);
  const height = lineEstimate(line.text, theme);
  return height ? Decoration.widget({ widget: new HeightHint(height), side: -1 }).range(line.from) : null;
}

function cursorLines(state: EditorState): Set<number> {
  return new Set(state.selection.ranges.map((r) => state.doc.lineAt(r.head).number));
}

function allHints(state: EditorState): DecorationSet {
  const theme = state.facet(markdownTheme);
  const skip = cursorLines(state);
  const ranges: Range<Decoration>[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    if (skip.has(n)) continue;
    const hint = hintAt(state, n, theme);
    if (hint) ranges.push(hint);
  }
  return Decoration.set(ranges);
}

const heightHints = StateField.define<DecorationSet>({
  create: allHints,
  update(hints, tr) {
    if (tr.effects.some((effect) => effect.is(refreshEstimates)) || tr.state.facet(markdownTheme) !== tr.startState.facet(markdownTheme)) {
      return allHints(tr.state);
    }
    if (!tr.docChanged && !tr.selection) return hints;
    const { state } = tr;
    hints = hints.map(tr.changes);
    // Redo the lines that changed and the lines the cursor left or entered.
    const redo = new Set<number>();
    tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
      for (let n = state.doc.lineAt(fromB).number; n <= state.doc.lineAt(toB).number; n++) redo.add(n);
    });
    for (const r of tr.startState.selection.ranges) redo.add(state.doc.lineAt(tr.changes.mapPos(r.head)).number);
    const skip = cursorLines(state);
    for (const n of skip) redo.add(n);
    const theme = state.facet(markdownTheme);
    for (const n of redo) {
      const line = state.doc.line(n);
      const hint = skip.has(n) ? null : hintAt(state, n, theme);
      hints = hints.update({ filter: () => false, filterFrom: line.from, filterTo: line.from, add: hint ? [hint] : [] });
    }
    return hints;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// CodeMirror puts a 1em image (cm-widgetBuffer) after an inline widget, on the baseline. With a
// tight line height (1.25 at heading size) it reaches above the line and makes it taller than
// the line height. From the top of the line, it fits any line height of 1 or more.
const hintTheme = EditorView.baseTheme({
  '.sm-height-hint + .cm-widgetBuffer': { verticalAlign: 'top' },
});

/** Better height estimates for headings and wrapping lines that are not drawn yet. */
export function lineHeightHints(): Extension {
  return [heightHints, hintTheme];
}
