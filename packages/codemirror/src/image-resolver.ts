import { Facet, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Turns a path as written in the document into a URL to load, or several to try in order
 * (the first that loads is shown), or null if it can't be loaded. `undefined` means the host
 * doesn't know yet (its file is still loading): the editor shows that it is loading, and the
 * host calls `refreshImages` once it knows.
 */
export type ImageResolver = (src: string) => string | readonly string[] | null | undefined;

/** The URLs a resolver gives for `src`, in order; undefined while the host is still loading. */
export function resolvedUrls(resolve: ImageResolver, src: string): string[] | undefined {
  const result = resolve(src);
  return result === undefined ? undefined : result === null ? [] : typeof result === 'string' ? [result] : [...result];
}

/** How image (and file) paths are resolved; by default they are used as written. */
export const imageResolver = Facet.define<ImageResolver, ImageResolver>({ combine: (values) => values[0] ?? ((src) => src) });

/** Asks the editor to resolve its images again. */
export const imagesChanged = StateEffect.define<null>();

/** Resolves the images again, e.g. when files the resolver was waiting for have loaded. */
export function refreshImages(view: EditorView): void {
  view.dispatch({ effects: imagesChanged.of(null) });
}
