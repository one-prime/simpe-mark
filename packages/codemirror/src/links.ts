// Following links. Link text is editable, so a plain click places the cursor and Ctrl+Click
// (Cmd+Click on macOS) opens the link, as in VS Code. `#heading` links jump within the
// document; other schemes than http(s)/mailto are refused; everything else goes to the
// host's `openLink` (a browser opens a tab; VS Code opens files in its own editors).

import { syntaxTree } from '@codemirror/language';
import { Facet, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { headingAnchors, linkAt, linkKind } from '@simple-mark/model';
import { imageResolver, resolvedUrls } from './image-resolver';

/** What to open: a web address, or a path as written (an image, another document, …). */
export interface LinkTarget {
  kind: 'web' | 'file' | 'image';
  url: string;
}

/** Opens a link target; hosts replace this with their own (see `createEditor`'s `openLink`). */
export type LinkOpener = (target: LinkTarget, view: EditorView) => void;

/** In a browser: web addresses and paths (resolved like images) open in a new tab. */
const openInBrowser: LinkOpener = (target, view) => {
  const url = target.kind === 'web' ? target.url : resolvedUrls(view.state.facet(imageResolver), target.url)[0];
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

/** How links are opened. */
export const linkOpener = Facet.define<LinkOpener, LinkOpener>({ combine: (values) => values[0] ?? openInBrowser });

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** The key held to follow a link: Cmd on macOS, Ctrl elsewhere. */
export const followKeyName = isMac ? '⌘' : 'Ctrl';
const followKey = (event: MouseEvent | KeyboardEvent) => (isMac ? event.metaKey : event.ctrlKey);

/**
 * Follows a link target as written (`isImage`: from `![alt](src)`). Returns false when there
 * is nothing to open: no target, an unsafe scheme, or an anchor no heading has.
 */
export function followLink(view: EditorView, target: string | null, isImage = false): boolean {
  if (target === null) return false;
  const { kind, url } = linkKind(target);
  if (kind === 'unsafe') return false;
  if (kind === 'anchor') {
    const wanted = decodeURIComponent(url.slice(1)).toLowerCase();
    const heading = headingAnchors(syntaxTree(view.state), view.state.doc.toString()).find((h) => h.anchor === wanted);
    if (!heading) return false;
    view.dispatch({ selection: { anchor: heading.from }, effects: EditorView.scrollIntoView(heading.from, { y: 'start', yMargin: 24 }) });
    view.focus();
    return true;
  }
  view.state.facet(linkOpener)({ kind: kind === 'file' && isImage ? 'image' : kind, url }, view);
  return true;
}

/** Ctrl/Cmd+Click on a link follows it (instead of adding a cursor there). */
const clickToFollow = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || !followKey(event) || event.shiftKey || event.altKey) return false;
    // Only on the link's own text, not anywhere on its line.
    if (!(event.target instanceof Element) || !event.target.closest('.sm-link, .sm-url')) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const link = linkAt(syntaxTree(view.state), view.state.doc.toString(), pos);
    if (!link) return false;
    event.preventDefault();
    followLink(view, link.target, link.kind === 'image');
    return true;
  },
});

/** While Ctrl/Cmd is held, links look clickable (pointer, underline). */
const followKeyHint = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      for (const type of ['keydown', 'keyup', 'mousemove'] as const) window.addEventListener(type, this.track, true);
      window.addEventListener('blur', this.clear);
    }

    destroy(): void {
      for (const type of ['keydown', 'keyup', 'mousemove'] as const) window.removeEventListener(type, this.track, true);
      window.removeEventListener('blur', this.clear);
    }

    track = (event: KeyboardEvent | MouseEvent): void => {
      this.view.dom.classList.toggle('sm-follow-links', followKey(event));
    };

    clear = (): void => {
      this.view.dom.classList.remove('sm-follow-links');
    };
  },
);

const followTheme = EditorView.theme({
  '&.sm-follow-links .sm-link, &.sm-follow-links .sm-url': { cursor: 'pointer', textDecoration: 'underline' },
  '.sm-image-preview img': { cursor: 'pointer' },
});

/** Ctrl/Cmd+Click follows links; `#anchors` jump to headings. */
export function links(): Extension {
  return [clickToFollow, followKeyHint, followTheme];
}
