// MathJax is large, so @simple-mark/math loads the first time a document has math.

type MathModule = typeof import('@simple-mark/math');

let loaded: MathModule | undefined;
let loading: Promise<MathModule> | undefined;

export function loadMath(): Promise<MathModule> {
  loading ??= import('@simple-mark/math').then((m) => (loaded = m));
  return loading;
}

/** The math renderer if it has loaded, for synchronous use of its cache. */
export function loadedMath(): MathModule | undefined {
  return loaded;
}
