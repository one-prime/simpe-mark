// Display math for a canvas: MathJax's SVG (from @simple-mark/math, loaded the first time it is
// needed) as an image in the text's color. Sizes are in em, for `layoutMarkdown`'s `mathSize`.

import type { Size } from './layout';

type MathModule = typeof import('@simple-mark/math');

export interface MathImages {
  /**
   * Size in em of the text's font (`fontFamily`, whose x-height MathJax's ex units follow);
   * null if the TeX has an error; undefined while rendering (starts it).
   */
  size(tex: string, fontFamily: string): Size | null | undefined;
  /** The formula drawn in `color`, its error message, or undefined while it is being made. */
  image(tex: string, color: string): CanvasImageSource | string | undefined;
}

/** CSS ex as a share of the font size when it can't be measured. */
const DEFAULT_EX = 0.5;
/** Pixels per em of the images, so they stay sharp when a canvas is zoomed in. */
const PIXELS_PER_EM = 64;

/** Size in ex (MathJax's unit). */
type Rendered = { svg: string; ex: Size } | { error: string };

const exRatios = new Map<string, number>();

/** The x-height of a font as a share of its size: what CSS (and MathJax) call 1ex. */
function exRatio(fontFamily: string): number {
  let ratio = exRatios.get(fontFamily);
  if (ratio === undefined) {
    const ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (ctx) ctx.font = `100px ${fontFamily}`;
    ratio = (ctx ? ctx.measureText('x').actualBoundingBoxAscent / 100 : 0) || DEFAULT_EX;
    exRatios.set(fontFamily, ratio);
  }
  return ratio;
}

export function createMathImages(onReady: () => void): MathImages {
  let loading: Promise<MathModule> | undefined;
  const rendered = new Map<string, Rendered | 'rendering'>();
  const images = new Map<string, HTMLImageElement | 'loading'>();

  function render(tex: string): void {
    rendered.set(tex, 'rendering');
    loading ??= import('@simple-mark/math');
    void loading
      .then((m) => m.renderMath(tex, true))
      .then((result) => {
        if (result.svg === undefined) {
          rendered.set(tex, { error: result.error });
        } else {
          const ex = (name: string) => parseFloat(new RegExp(`${name}="([\\d.]+)ex"`).exec(result.svg)?.[1] ?? '0');
          rendered.set(tex, { svg: result.svg, ex: { width: ex('width'), height: ex('height') } });
        }
        onReady();
      });
  }

  return {
    size(tex, fontFamily) {
      const entry = rendered.get(tex);
      if (entry === undefined) render(tex);
      if (entry === undefined || entry === 'rendering') return undefined;
      if ('error' in entry) return null;
      const ratio = exRatio(fontFamily);
      return { width: entry.ex.width * ratio, height: entry.ex.height * ratio };
    },
    image(tex, color) {
      const entry = rendered.get(tex);
      if (entry === undefined || entry === 'rendering') return undefined;
      if ('error' in entry) return entry.error;
      const key = `${color}\n${tex}`;
      const known = images.get(key);
      if (known instanceof HTMLImageElement) return known;
      if (known === 'loading') return undefined;
      // currentColor would be black in an image; give it the text's color and a sharp size.
      const svg = entry.svg
        .replace(/currentColor/g, color)
        .replace(/width="[\d.]+ex"/, `width="${entry.ex.width * DEFAULT_EX * PIXELS_PER_EM}px"`)
        .replace(/height="[\d.]+ex"/, `height="${entry.ex.height * DEFAULT_EX * PIXELS_PER_EM}px"`);
      const img = new Image();
      images.set(key, 'loading');
      img.onload = () => {
        images.set(key, img);
        onReady();
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return undefined;
    },
  };
}
