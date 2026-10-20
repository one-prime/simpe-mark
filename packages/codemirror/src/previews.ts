// Previews that never replace the source: images and $$ blocks are drawn below their lines,
// inline $math$ in a tooltip while the cursor is in it or the mouse is over it. Math is
// rendered by @simple-mark/math, loaded the first time a document has math. Heights of previews
// not drawn yet are estimated in preview-heights.ts.

import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, hoverTooltip, showTooltip, type DecorationSet, type Tooltip } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import type { MathResult } from '@simple-mark/math';
import { mathSource, previewBlocks, type ImageSource } from '@simple-mark/model';
import { imageResolver, resolvedUrls, type ImageResolver } from './image-resolver';
import { lineHeightHints } from './line-heights';
import { followLink } from './links';
import { loadMath, loadedMath } from './math-loader';
import {
  PREVIEW_EM,
  previewPadding,
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

export { imageResolver, type ImageResolver } from './image-resolver';

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
    dom.style.minHeight = `${this.estimate - previewPadding()}px`;
    renderInto(dom, this.tex, true, () => {
      dom.style.minHeight = '';
      view.requestMeasure();
      rememberHeight(view, this.key, dom);
    });
    return dom;
  }
}

// ---- images ------------------------------------------------------------------------------------

export interface ImageRef {
  /** As written, for messages. */
  raw: string;
  /** URL to load, or null when it can't be resolved. */
  src: string | null;
  /** More URLs to try in order when `src` doesn't load. */
  fallbacks?: string[];
  alt: string;
  problem?: string;
}

/** An image from the document with its path resolved by the host. */
function imageRef(image: ImageSource, resolve: ImageResolver): ImageRef {
  if (image.src === null) return { raw: image.raw, src: null, alt: image.alt, problem: `No definition for ${image.raw}` };
  const [src, ...fallbacks] = resolvedUrls(resolve, image.src);
  if (src === undefined) return { raw: image.raw, src: null, alt: image.alt, problem: `Can't load ${image.raw}` };
  return { raw: image.raw, src, ...(fallbacks.length ? { fallbacks } : {}), alt: image.alt };
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
      img.title = `${image.raw} (click to open)`;
      img.addEventListener('click', () => followLink(view, image.raw, true));
      img.onload = settled;
      const fallbacks = [...(image.fallbacks ?? [])];
      img.onerror = () => {
        const next = fallbacks.shift();
        if (next !== undefined) {
          // Not at the first place it could be: try the next.
          watchImage(img, next);
          img.src = next;
          return;
        }
        img.replaceWith(problem(`Image not found: ${image.raw}`));
        settled();
      };
    }
    // Sizes still unknown: hold the estimated height until they are.
    if (unsized > 0) dom.style.minHeight = `${this.estimate - previewPadding()}px`;
    if (waiting === 0) rememberHeight(view, this.key, dom);
    return dom;
  }
}

// ---- block previews ----------------------------------------------------------------------------

/** A preview drawn below the line ending at `at`. */
export type BlockPreview = { at: number; images: ImageRef[] } | { at: number; tex: string };

/** What to preview below which lines: the images of each line, and closed non-empty $$ blocks. */
export function blockPreviewSources(state: EditorState): BlockPreview[] {
  const resolve = state.facet(imageResolver);
  // doc.toString() joins lines with "\n", so offsets are CodeMirror positions.
  return previewBlocks(syntaxTree(state), state.doc.toString()).map((block) =>
    'tex' in block ? block : { at: block.at, images: block.images.map((image) => imageRef(image, resolve)) },
  );
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
  const tex = node && mathSource(node, (from, to) => state.sliceDoc(from, to));
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

const em = (value: number) => `${value}em`;
const previewSpacing = `${em(PREVIEW_EM.top)} 0 ${em(PREVIEW_EM.bottom)}`;

/** Sizes in em (see PREVIEW_EM), so previews scale with the text like on a canvas. */
const previewTheme = EditorView.theme({
  '.sm-image-preview': { display: 'flex', flexWrap: 'wrap', gap: em(PREVIEW_EM.imageGap), padding: previewSpacing },
  '.sm-image-preview img': { maxWidth: '100%', maxHeight: em(PREVIEW_EM.imageMaxHeight), borderRadius: em(PREVIEW_EM.radius) },
  '.sm-image-error, .sm-math-error': { color: '#cf222e', fontSize: '0.9em' },
  '.sm-math-preview': { textAlign: 'center', padding: previewSpacing, overflowX: 'auto', overflowY: 'hidden' },
  '.sm-math-tooltip': { padding: '6px 10px' },
});

/** Image and math previews; the source text always stays visible. */
export function previews(): Extension {
  return [blockPreviewField, previewLayout, lineHeightHints(), cursorMathTooltip, hoverMathTooltip, previewTheme];
}
