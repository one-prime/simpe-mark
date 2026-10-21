// The MathJax font SimpleMark draws math with, for bundler configs. MathJax's SVG output also
// imports its default font (New Computer Modern) through the package import "#default-font/*",
// whatever font it is given; pointing that import at our font keeps New Computer Modern, whose
// license is unclear in MathJax's version (see DESIGN.md, Licenses), out of every bundle.

import { readdirSync } from 'node:fs';

export const FONT_PACKAGE = '@mathjax/mathjax-modern-font';

/** For `resolve.alias` (Vite, Rolldown). */
export const fontAlias = { find: /^#default-font\/(.*)$/, replacement: `${FONT_PACKAGE}/mjs/$1` };

/** The font's on-demand parts, for a dev server to prepare at startup (`optimizeDeps.include`). */
export function fontParts() {
  return readdirSync(new URL(`../node_modules/${FONT_PACKAGE}/mjs/svg/dynamic`, import.meta.url))
    .filter((file) => file.endsWith('.js'))
    .map((file) => `${FONT_PACKAGE}/js/svg/dynamic/${file}`);
}
