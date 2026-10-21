// On-demand parts of the MathJax Latin Modern SVG font. Each is a static import so
// any bundler makes it a separate chunk that loads only when a formula needs its glyphs.
// Generated from @mathjax/mathjax-modern-font/js/svg/dynamic/ (26 files in 4.1.3).

export const dynamicFonts: Record<string, () => Promise<unknown>> = {
  'PUA': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/PUA.js'),
  'accents': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/accents.js'),
  'accents-b-i': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/accents-b-i.js'),
  'arrows': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/arrows.js'),
  'calligraphic': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/calligraphic.js'),
  'double-struck': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/double-struck.js'),
  'fraktur': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/fraktur.js'),
  'latin': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/latin.js'),
  'latin-b': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/latin-b.js'),
  'latin-bi': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/latin-bi.js'),
  'latin-i': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/latin-i.js'),
  'math': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/math.js'),
  'monospace': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/monospace.js'),
  'monospace-ex': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/monospace-ex.js'),
  'monospace-l': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/monospace-l.js'),
  'sans-serif': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/sans-serif.js'),
  'sans-serif-b': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/sans-serif-b.js'),
  'sans-serif-bi': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/sans-serif-bi.js'),
  'sans-serif-ex': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/sans-serif-ex.js'),
  'sans-serif-i': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/sans-serif-i.js'),
  'sans-serif-r': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/sans-serif-r.js'),
  'script': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/script.js'),
  'shapes': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/shapes.js'),
  'symbols': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/symbols.js'),
  'symbols-b-i': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/symbols-b-i.js'),
  'variants': () => import('@mathjax/mathjax-modern-font/js/svg/dynamic/variants.js'),
};
