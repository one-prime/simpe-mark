// Previews that never replace the source: images and $$ blocks are drawn below their lines,
// inline $math$ in a tooltip while the cursor is in it or the mouse is over it. Math is
// rendered by @simplemark/math, loaded the first time a document has math. Heights of previews
// not drawn yet are estimated in preview-heights.ts.

import { syntaxTree } from '@codemirror/language';
import { Facet, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, hoverTooltip, showTooltip, type DecorationSet, type Tooltip } from '@codemirror/view';
import type { SyntaxNode, Tree } from '@lezer/common';
import type { MathResult } from '@simplemark/math';
import { lineHeightHints } from './line-heights';
import { loadMath, loadedMath } from './math-loader';
import {
  PREVIEW_PADDING,
  imagesEstimate,
  knownImageSize,
  mathEstimate,
  previewLayout,
  refreshEstimates,
  rememberHeight,
  reserveImageBox,
  watchImage,
  whenImageSized,
} from './preview-heights';

/** Turns an image path as written in the document into a URL to load, or null if it can't. */
export type ImageResolver = (src: string) => string | null;

/** How image paths are resolved; by default they are used as written. */
export const imageResolver = Facet.define<ImageResolver, ImageResolver>({ combine: (values) => values[0] ?? ((src) => src) });

// ---- math --------------------------------------------------------------------------------------

/** Fills `dom` with rendered math now if known, otherwise when it is ready. */
function renderInto(dom: HTMLElement, tex: string, display: boolean, onDone?: () => void): void {
  const show = (result: MathResult) => {
    dom.textContent = '';
    if (result.svg !== undefined) dom.innerHTML = result.svg;
    else {
      const error = dom.appendChild(document.createElement('span'));
      error.className = 'sm-math-error';
      error.textContent = `Math error: ${result.error}`;
    }
    onDone?.();
  };
  const known = loadedMath()?.cachedMath(tex, display);
  if (known) return show(known);
  dom.textContent = '…';
  void loadMath()
    .then((m) => m.renderMath(tex, display))
    .then(show, (error: unknown) => show({ error: `could not load the math renderer (${String(error)})` }));
}

class MathBlockWidget extends WidgetType {
  readonly key: string;
  readonly estimate: number;

  constructor(readonly tex: string) {
    super();
    this.key = `math\n${tex}`;
    this.estimate = mathEstimate(this.key, tex);
  }

  override eq(other: MathBlockWidget): boolean {
    return other.key === this.key && other.estimate === this.estimate;
  }

  /** Only the estimate changed: keep the drawn formula. */
  override updateDOM(dom: HTMLElement): boolean {
    return dom.dataset['key'] === this.key;
  }

  override get estimatedHeight(): number {
    return this.estimate;
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'sm-math-preview';
    dom.dataset['key'] = this.key;
    // Hold the estimated height until the formula is drawn, so it is never measured empty.
    dom.style.minHeight = `${this.estimate - PREVIEW_PADDING}px`;
    renderInto(dom, this.tex, true, () => {
      dom.style.minHeight = '';
      view.requestMeasure();
      rememberHeight(view, this.key, dom);
    });
    return dom;
  }
}

/** The TeX of a math node: the text between its delimiters, without quote markers. */
function mathTex(state: EditorState, node: SyntaxNode): string | null {
  const marks = node.getChildren('MathMark');
  if (marks.length < 2) return null; // not closed yet
  if (node.name === 'InlineMath') return state.sliceDoc(marks[0]!.to, marks[1]!.from);
  return node
    .getChildren('MathText')
    .map((text) => state.sliceDoc(text.from, text.to))
    .join('\n');
}

// ---- images ------------------------------------------------------------------------------------

export interface ImageRef {
  /** As written, for messages. */
  raw: string;
  /** URL to load, or null when it can't be resolved. */
  src: string | null;
  alt: string;
  problem?: string;
}

const normalizeLabel = (label: string) => label.slice(1, -1).trim().replace(/\s+/g, ' ').toLowerCase();

/** A link destination as written, without the optional angle brackets (`<a b.png>`). */
const destination = (state: EditorState, url: SyntaxNode) => state.sliceDoc(url.from, url.to).replace(/^<(.*)>$/, '$1');

/** Link reference definitions (`[label]: url`) of the document, by normalized label. */
function linkDefinitions(state: EditorState, tree: Tree): Map<string, string> {
  const definitions = new Map<string, string>();
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'LinkReference') continue;
    const label = node.getChild('LinkLabel');
    const url = node.getChild('URL');
    if (label && url) {
      const key = normalizeLabel(state.sliceDoc(label.from, label.to));
      if (!definitions.has(key)) definitions.set(key, destination(state, url));
    }
  }
  return definitions;
}

function imageRef(state: EditorState, node: SyntaxNode, definitions: Map<string, string>, resolve: ImageResolver): ImageRef {
  const marks = node.getChildren('LinkMark');
  const alt = marks.length >= 2 ? state.sliceDoc(marks[0]!.to, marks[1]!.from) : '';
  const url = node.getChild('URL');
  let raw: string | undefined = url ? destination(state, url) : undefined;
  if (raw === undefined) {
    // [alt][label], [alt][] or [alt]: the label names a definition.
    const labelNode = node.getChild('LinkLabel');
    const labelText = labelNode && labelNode.to - labelNode.from > 2 ? state.sliceDoc(labelNode.from, labelNode.to) : `[${alt}]`;
    raw = definitions.get(normalizeLabel(labelText));
    if (raw === undefined) return { raw: labelText, src: null, alt, problem: `No definition for ${labelText}` };
  }
  const src = resolve(raw);
  return src === null ? { raw, src, alt, problem: `Can't load ${raw}` } : { raw, src, alt };
}

class ImageWidget extends WidgetType {
  readonly key: string;
  readonly estimate: number;

  constructor(readonly images: readonly ImageRef[]) {
    super();
    this.key = `images\n${JSON.stringify(images)}`;
    this.estimate = imagesEstimate(this.key, images.map((image) => image.src));
  }

  override eq(other: ImageWidget): boolean {
    return other.key === this.key && other.estimate === this.estimate;
  }

  /** Only the estimate changed: keep the drawn images. */
  override updateDOM(dom: HTMLElement): boolean {
    return dom.dataset['key'] === this.key;
  }

  override get estimatedHeight(): number {
    return this.estimate;
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'sm-image-preview';
    dom.dataset['key'] = this.key;
    let waiting = 0;
    let unsized = 0;
    const settled = () => {
      view.requestMeasure();
      if (--waiting === 0) rememberHeight(view, this.key, dom);
    };
    for (const image of this.images) {
      const problem = (text: string) => {
        const span = document.createElement('span');
        span.className = 'sm-image-error';
        span.textContent = text;
        return span;
      };
      if (image.src === null) {
        dom.appendChild(problem(image.problem ?? `Can't load ${image.raw}`));
        continue;
      }
      waiting++;
      const img = dom.appendChild(document.createElement('img'));
      // Give the image its final box before its pixels arrive, so it is never measured empty.
      const size = knownImageSize(image.src);
      if (size) reserveImageBox(img, size);
      else if (size === undefined) {
        unsized++;
        watchImage(img, image.src);
        whenImageSized(image.src, (known) => {
          if (known) reserveImageBox(img, known);
          if (--unsized === 0) dom.style.minHeight = '';
          view.requestMeasure();
        });
      }
      // Don't hold frames for decoding (a big image is megabytes of pixels): while scrolling
      // fast through new images, the image may appear a frame later instead.
      img.decoding = 'async';
      img.src = image.src;
      img.alt = image.alt;
      img.title = image.raw;
      img.onload = settled;
      img.onerror = () => {
        img.replaceWith(problem(`Image not found: ${image.raw}`));
        settled();
      };
    }
    // Sizes still unknown: hold the estimated height until they are.
    if (unsized > 0) dom.style.minHeight = `${this.estimate - PREVIEW_PADDING}px`;
    if (waiting === 0) rememberHeight(view, this.key, dom);
    return dom;
  }
}

// ---- block previews ----------------------------------------------------------------------------

/** A preview drawn below the line ending at `at`. */
export type BlockPreview = { at: number; images: ImageRef[] } | { at: number; tex: string };

/** What to preview below which lines: the images of each line, and closed non-empty $$ blocks. */
export function blockPreviewSources(state: EditorState): BlockPreview[] {
  const tree = syntaxTree(state);
  const resolve = state.facet(imageResolver);
  const definitions = linkDefinitions(state, tree);
  const imagesByLine = new Map<number, ImageRef[]>();
  const previews: BlockPreview[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === 'Image') {
        const at = state.doc.lineAt(node.to).to;
        let images = imagesByLine.get(at);
        if (!images) {
          imagesByLine.set(at, (images = []));
          previews.push({ at, images });
        }
        images.push(imageRef(state, node.node, definitions, resolve));
        return false;
      }
      if (node.name === 'BlockMath') {
        const tex = mathTex(state, node.node);
        if (tex !== null && tex.trim()) previews.push({ at: state.doc.lineAt(node.to).to, tex });
        return false;
      }
      return undefined;
    },
  });
  return previews;
}

function blockPreviews(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = blockPreviewSources(state).map((preview) => {
    const widget = 'tex' in preview ? new MathBlockWidget(preview.tex) : new ImageWidget(preview.images);
    return Decoration.widget({ widget, block: true, side: 1 }).range(preview.at);
  });
  return Decoration.set(ranges, true);
}

/** Block widgets change line heights, so CodeMirror wants them from a state field. */
const blockPreviewField = StateField.define<DecorationSet>({
  create: blockPreviews,
  update(previews, tr) {
    const changed =
      tr.docChanged ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
      tr.state.facet(imageResolver) !== tr.startState.facet(imageResolver) ||
      tr.effects.some((effect) => effect.is(refreshEstimates));
    return changed ? blockPreviews(tr.state) : previews;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// ---- inline math tooltips ----------------------------------------------------------------------

function inlineMathAt(state: EditorState, pos: number): SyntaxNode | null {
  const tree = syntaxTree(state);
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      if (node.name === 'InlineMath') return node;
    }
  }
  return null;
}

function mathTooltip(state: EditorState, pos: number): Tooltip | null {
  const node = inlineMathAt(state, pos);
  const tex = node && mathTex(state, node);
  if (!node || !tex) return null;
  const display = node.getChild('MathMark')!.to - node.from === 2;
  return {
    pos: node.from,
    end: node.to,
    above: true,
    create: (view) => {
      const dom = document.createElement('div');
      dom.className = 'sm-math-tooltip';
      renderInto(dom, tex, display, () => view.requestMeasure());
      return { dom };
    },
  };
}

/** The tooltip for inline math under the cursor. */
const cursorMathTooltip = StateField.define<Tooltip | null>({
  create: (state) => (state.selection.main.empty ? mathTooltip(state, state.selection.main.head) : null),
  update(tooltip, tr) {
    if (!tr.docChanged && !tr.selection) return tooltip;
    const { main } = tr.state.selection;
    const next = main.empty ? mathTooltip(tr.state, main.head) : null;
    // Keep the open tooltip while the cursor moves inside the same, unchanged formula.
    if (next && tooltip && !tr.docChanged && next.pos === tooltip.pos && next.end === tooltip.end) return tooltip;
    return next;
  },
  provide: (field) => showTooltip.from(field),
});

const hoverMathTooltip = hoverTooltip((view, pos) => {
  // Skip when the cursor tooltip already shows this formula.
  const cursor = view.state.field(cursorMathTooltip, false);
  const tooltip = mathTooltip(view.state, pos);
  return tooltip && cursor?.pos === tooltip.pos ? null : tooltip;
});

const previewTheme = EditorView.theme({
  '.sm-image-preview': { display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '4px 0 8px' },
  '.sm-image-preview img': { maxWidth: '100%', maxHeight: '320px', borderRadius: '4px' },
  '.sm-image-error, .sm-math-error': { color: '#cf222e', fontSize: '0.9em' },
  '.sm-math-preview': { textAlign: 'center', padding: '4px 0 8px', overflowX: 'auto', overflowY: 'hidden' },
  '.sm-math-tooltip': { padding: '6px 10px' },
});

/** Image and math previews; the source text always stays visible. */
export function previews(): Extension {
  return [blockPreviewField, previewLayout, lineHeightHints(), cursorMathTooltip, hoverMathTooltip, previewTheme];
}
