// Height estimates for previews that are not drawn yet. CodeMirror lays out only what is on
// screen and estimates the rest; a widget without an estimate counts as one line. A document
// with many images was estimated at less than half its height, so while dragging the
// scrollbar fast CodeMirror kept correcting the height and the thumb ran away from the mouse.
//
// So: image sizes are read in the background as soon as a preview exists, formulas are
// rendered in the background, drawn previews remember their measured height, and when
// estimates improve the previews are refreshed (without redrawing those on screen).

import { StateEffect } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { loadMath, loadedMath } from './math-loader';

/** Vertical padding of a preview (CSS: 4px above, 8px below). */
export const PREVIEW_PADDING = 12;
/** Largest image preview height (CSS max-height). */
export const IMAGE_MAX_HEIGHT = 320;
/** Gap between images on one line (CSS gap). */
const IMAGE_GAP = 8;

/** Editor facts the estimates depend on, measured by `previewLayout`. */
const layout = { contentWidth: 700, exPx: 8, lineHeight: 24, fontSize: 15, fontFamily: 'sans-serif' };

/** The measured editor facts (content width, line height, resolved text font). */
export function layoutFacts(): Readonly<typeof layout> {
  return layout;
}

const measured = new Map<string, number>();
const imageSizes = new Map<string, { width: number; height: number } | null>();
const probing = new Set<string>();
const mathQueue = new Set<string>();
let mathRunning = false;

const listeners = new Set<() => void>();
let notifyScheduled = false;

/** Tells every editor that estimates improved (batched). */
function estimatesImproved(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => {
    notifyScheduled = false;
    for (const listener of listeners) listener();
  }, 30);
}

/** Refreshes the previews so their widgets carry the current estimates. */
export const refreshEstimates = StateEffect.define<null>();

/** Remembers the height of a drawn preview, as the estimate for when it is off screen. */
export function rememberHeight(view: EditorView, key: string, dom: HTMLElement): void {
  view.requestMeasure({
    read: () => (dom.isConnected ? dom.getBoundingClientRect().height / view.scaleY : 0),
    write: (height) => {
      if (height > 0) measured.set(key, Math.round(height));
    },
  });
}

// ---- images ------------------------------------------------------------------------------------

type ImageSize = { width: number; height: number };
const sizeWaiters = new Map<string, ((size: ImageSize | null) => void)[]>();

function sizeKnown(src: string, size: ImageSize | null): void {
  if (imageSizes.has(src)) return;
  imageSizes.set(src, size);
  for (const waiter of sizeWaiters.get(src) ?? []) waiter(size);
  sizeWaiters.delete(src);
  estimatesImproved();
}

/**
 * Watches an image until its size is known. The size is in the first bytes of the file, so it
 * is checked every frame while loading instead of waiting for the whole (possibly large) file.
 */
export function watchImage(img: HTMLImageElement, src: string): void {
  if (imageSizes.has(src)) return;
  // SVGs without a size of their own are drawn 300 × 150, like any replaced element.
  const natural = () => (img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : { width: 300, height: 150 });
  img.addEventListener('load', () => sizeKnown(src, natural()));
  img.addEventListener('error', () => sizeKnown(src, null));
  const check = () => {
    if (imageSizes.has(src) || img.complete) return;
    if (img.naturalWidth > 0) sizeKnown(src, natural());
    else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

/** The size of an image if known: null if it failed, undefined while unknown. */
export function knownImageSize(src: string): ImageSize | null | undefined {
  return imageSizes.get(src);
}

/** Calls `then` once the image's size is known (someone must be watching or probing it). */
export function whenImageSized(src: string, then: (size: ImageSize | null) => void): void {
  const size = imageSizes.get(src);
  if (size !== undefined) return then(size);
  const waiters = sizeWaiters.get(src) ?? [];
  waiters.push(then);
  sizeWaiters.set(src, waiters);
}

/** Gives an <img> its final layout size before its pixels arrive (CSS caps it at the width). */
export function reserveImageBox(img: HTMLImageElement, size: ImageSize): void {
  img.style.aspectRatio = `${size.width} / ${size.height}`;
  img.style.width = `${Math.min(size.width, (IMAGE_MAX_HEIGHT * size.width) / size.height)}px`;
}

function probeImage(src: string): void {
  if (probing.has(src) || imageSizes.has(src) || typeof Image === 'undefined') return;
  probing.add(src);
  const img = new Image();
  watchImage(img, src);
  img.src = src;
}

/** Displayed size of one image: fits the width, at most IMAGE_MAX_HEIGHT tall, never enlarged. */
function imageBox(src: string | null): { width: number; height: number } {
  const errorLine = { width: layout.contentWidth, height: layout.lineHeight };
  if (src === null) return errorLine;
  const size = imageSizes.get(src);
  if (size === undefined) {
    probeImage(src);
    return { width: layout.contentWidth, height: IMAGE_MAX_HEIGHT / 2 };
  }
  if (size === null) return errorLine;
  const scale = Math.min(1, layout.contentWidth / size.width, IMAGE_MAX_HEIGHT / size.height);
  return { width: size.width * scale, height: size.height * scale };
}

/** Estimated height of a row of images (they wrap like the CSS flex row). */
export function imagesEstimate(key: string, srcs: readonly (string | null)[]): number {
  const known = measured.get(key);
  if (known) return known;
  let total = 0;
  let rowWidth = 0;
  let rowHeight = 0;
  for (const src of srcs) {
    const box = imageBox(src);
    if (rowWidth > 0 && rowWidth + IMAGE_GAP + box.width > layout.contentWidth) {
      total += rowHeight + IMAGE_GAP;
      rowWidth = 0;
      rowHeight = 0;
    }
    rowWidth += (rowWidth > 0 ? IMAGE_GAP : 0) + box.width;
    rowHeight = Math.max(rowHeight, box.height);
  }
  return Math.round(total + rowHeight + PREVIEW_PADDING);
}

// ---- math --------------------------------------------------------------------------------------

/** Renders queued formulas one at a time, so their heights are known before they are shown. */
function renderQueuedMath(): void {
  if (mathRunning) return;
  mathRunning = true;
  void loadMath().then(async (math) => {
    let done = 0;
    for (const tex of mathQueue) {
      await math.renderMath(tex, true);
      mathQueue.delete(tex);
      if (++done % 10 === 0) estimatesImproved();
      await new Promise((resolve) => setTimeout(resolve, 0)); // let typing and scrolling run
    }
    mathRunning = false;
    estimatesImproved();
    if (mathQueue.size) renderQueuedMath();
  });
}

/** Estimated height of a display formula: from its rendered SVG, once known. */
export function mathEstimate(key: string, tex: string): number {
  const known = measured.get(key);
  if (known) return known;
  const result = loadedMath()?.cachedMath(tex, true);
  if (result?.svg !== undefined) {
    const height = /height="([\d.]+)ex"/.exec(result.svg);
    if (height) return Math.round(parseFloat(height[1]!) * layout.exPx + PREVIEW_PADDING);
  } else if (result?.error !== undefined) {
    return layout.lineHeight + PREVIEW_PADDING;
  } else {
    mathQueue.add(tex);
    renderQueuedMath();
  }
  return 3 * layout.lineHeight + PREVIEW_PADDING;
}

// ---- layout ------------------------------------------------------------------------------------

/** Measures the editor (content width, x-height, line height) and refreshes previews on news. */
export const previewLayout = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      listeners.add(this.refresh);
      this.measure();
    }

    update(update: ViewUpdate): void {
      if (update.geometryChanged) this.measure();
    }

    destroy(): void {
      listeners.delete(this.refresh);
    }

    refresh = (): void => {
      this.view.dispatch({ effects: refreshEstimates.of(null) });
    };

    measure(): void {
      this.view.requestMeasure({
        read: (view) => {
          const style = getComputedStyle(view.contentDOM);
          const width = view.contentDOM.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          const ctx = document.createElement('canvas').getContext('2d');
          let exPx = layout.exPx;
          if (ctx) {
            ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            exPx = ctx.measureText('x').actualBoundingBoxAscent || exPx;
          }
          // The base line height from CSS: view.defaultLineHeight comes from whichever short
          // plain line CodeMirror measured, which can be a (bigger) heading.
          const lineHeight = style.lineHeight.endsWith('px') ? parseFloat(style.lineHeight) : view.defaultLineHeight;
          return { contentWidth: width, exPx, lineHeight, fontSize: parseFloat(style.fontSize), fontFamily: style.fontFamily };
        },
        write: (next) => {
          const moved =
            Math.abs(next.contentWidth - layout.contentWidth) > 1 ||
            Math.abs(next.exPx - layout.exPx) > 0.2 ||
            Math.abs(next.lineHeight - layout.lineHeight) > 0.5 ||
            next.fontSize !== layout.fontSize ||
            next.fontFamily !== layout.fontFamily;
          if (moved && next.contentWidth > 0) {
            // Images scale with the width, so heights measured at another width are stale.
            if (Math.abs(next.contentWidth - layout.contentWidth) > 1) measured.clear();
            Object.assign(layout, next);
            estimatesImproved();
          }
        },
      });
    }
  },
);
