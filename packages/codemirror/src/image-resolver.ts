import { Facet } from '@codemirror/state';

/**
 * Turns a path as written in the document into a URL to load, or several to try in order
 * (the first that loads is shown), or null if it can't be loaded.
 */
export type ImageResolver = (src: string) => string | readonly string[] | null;

/** The URLs a resolver gives for `src`, in order. */
export function resolvedUrls(resolve: ImageResolver, src: string): string[] {
  const result = resolve(src);
  return result === null ? [] : typeof result === 'string' ? [result] : [...result];
}

/** How image (and file) paths are resolved; by default they are used as written. */
export const imageResolver = Facet.define<ImageResolver, ImageResolver>({ combine: (values) => values[0] ?? ((src) => src) });
