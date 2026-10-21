// TeX to a self-contained SVG string with MathJax (no fonts to load, no DOM needed), so the
// same output works in the editor, on a canvas, and on the command line.

import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/braket/BraketConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import { MathJaxModernFont } from '@mathjax/mathjax-modern-font/js/svg.js';
import { dynamicFonts } from './fonts';

/**
 * TeX packages. Left out on purpose: html, texhtml and textmacros (\href, \style, raw HTML) and
 * require/autoload (loading more code), because documents may come from anyone.
 */
const PACKAGES = ['base', 'ams', 'boldsymbol', 'braket', 'cancel', 'color', 'newcommand'];

export type MathResult = { svg: string; error?: undefined } | { svg?: undefined; error: string };

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const FONT_PREFIX = '@mathjax/mathjax-modern-font/js/svg/dynamic/';
mathjax.asyncLoad = (file: string) => {
  const name = file.startsWith(FONT_PREFIX) ? file.slice(FONT_PREFIX.length).replace(/\.js$/, '') : '';
  const load = dynamicFonts[name];
  return load ? load() : Promise.reject(new Error(`MathJax wanted ${file}, which is not bundled`));
};

const document = mathjax.document('', {
  InputJax: new TeX({
    packages: PACKAGES,
    // Throw instead of drawing the error into the formula, so the editor can show it as text.
    formatError: (_jax: unknown, error: unknown) => {
      throw error;
    },
  }),
  // One <svg> per formula: inline math is never broken across lines.
  OutputJax: new SVG({ fontData: MathJaxModernFont, fontCache: 'none', linebreaks: { inline: false } }),
});

const cache = new Map<string, MathResult>();
const CACHE_SIZE = 500;

function remember(key: string, result: MathResult): MathResult {
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

const keyOf = (tex: string, display: boolean) => (display ? 'D' : 'I') + tex;

/** A formula rendered before, or undefined if it still has to be rendered with `renderMath`. */
export function cachedMath(tex: string, display: boolean): MathResult | undefined {
  return cache.get(keyOf(tex, display));
}

/** Renders `tex` (without its $ delimiters) as SVG, loading font parts it needs first. */
export async function renderMath(tex: string, display: boolean): Promise<MathResult> {
  const key = keyOf(tex, display);
  const known = cache.get(key);
  if (known) return known;
  try {
    const node = await mathjax.handleRetriesFor(() => document.convert(tex, { display }));
    return remember(key, { svg: adaptor.innerHTML(node) });
  } catch (error) {
    // MathJax's TexError has a message but is not an Error subclass.
    const message = (error as { message?: unknown } | null)?.message;
    return remember(key, { error: typeof message === 'string' ? message : String(error) });
  }
}
