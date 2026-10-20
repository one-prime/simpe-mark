// MathJax is large, so @simplemark/math loads the first time a document has math.

type MathModule = typeof import('@simplemark/math');

let loaded: MathModule | undefined;
let loading: Promise<MathModule> | undefined;

export function loadMath(): Promise<MathModule> {
  loading ??= import('@simplemark/math').then((m) => (loaded = m));
  return loading;
}

/** The math renderer if it has loaded, for synchronous use of its cache. */
export function loadedMath(): MathModule | undefined {
  return loaded;
}
