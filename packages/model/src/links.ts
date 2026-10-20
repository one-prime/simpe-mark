// Links in a document: which one is at a position, what kind of target it has, and the
// headings `#anchor` links point to. Opening a link is the host's job (a browser tab, VS Code,
// a canvas tool), so this only says what was clicked.

import type { SyntaxNode, Tree } from '@lezer/common';
import { destination, linkDefinitions, normalizeLabel } from './previews';

export interface LinkAt {
  /** An image (`![alt](src)`) or anything else that links (links, autolinks, bare URLs). */
  kind: 'link' | 'image';
  /** The target as written; null when a reference (`[text][label]`) has no definition. */
  target: string | null;
  /** Where the link is in the text. */
  from: number;
  to: number;
}

/** Where a URL node is a link's target rather than a bare URL of its own. */
const LINK_PARENTS = new Set(['Link', 'Image', 'Autolink', 'LinkReference']);

function targetOf(node: SyntaxNode, text: string, definitions: () => Map<string, string>): string | null {
  const url = node.name === 'URL' ? node : node.getChild('URL');
  if (url) return destination(text, url);
  // [text][label], [text][] or [text]: the label names a definition.
  const marks = node.getChildren('LinkMark');
  const content = marks.length >= 2 ? text.slice(marks[0]!.to, marks[1]!.from) : '';
  const label = node.getChild('LinkLabel');
  const labelText = label && label.to - label.from > 2 ? text.slice(label.from, label.to) : `[${content}]`;
  return definitions().get(normalizeLabel(labelText)) ?? null;
}

/**
 * The link at `pos`: a link, image, autolink, bare URL, or the URL of a definition
 * (`[label]: url`). `text` must use one character per line break, so offsets match the tree.
 */
export function linkAt(tree: Tree, text: string, pos: number): LinkAt | null {
  let definitions: Map<string, string> | undefined;
  const lazyDefinitions = () => (definitions ??= linkDefinitions(tree, text));
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      if (node.from > pos || node.to < pos) continue;
      if (node.name === 'Link' || node.name === 'Image' || node.name === 'Autolink') {
        return { kind: node.name === 'Image' ? 'image' : 'link', target: targetOf(node, text, lazyDefinitions), from: node.from, to: node.to };
      }
      if (node.name === 'URL' && !LINK_PARENTS.has(node.parent?.name ?? '')) {
        return { kind: 'link', target: destination(text, node), from: node.from, to: node.to };
      }
      if (node.name === 'URL' && node.parent?.name === 'LinkReference') {
        return { kind: 'link', target: destination(text, node), from: node.from, to: node.to };
      }
    }
  }
  return null;
}

/**
 * What a link target is:
 * - `web`: http(s), mailto, or a bare `www.` address (given back as a full URL)
 * - `anchor`: `#heading` in the same document
 * - `file`: a relative or absolute path (an image, another Markdown file, …)
 * - `unsafe`: any other scheme (javascript:, data:, file:, …), which should not be opened
 */
export function linkKind(target: string): { kind: 'web' | 'anchor' | 'file' | 'unsafe'; url: string } {
  const url = target.trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return { kind: 'web', url };
  if (/^www\./i.test(url)) return { kind: 'web', url: `https://${url}` };
  // An autolink like <name@example.com> is an e-mail address.
  if (/^[^\s/:@]+@[^\s/:@]+\.[^\s/:@]+$/.test(url)) return { kind: 'web', url: `mailto:${url}` };
  if (url.startsWith('#')) return { kind: 'anchor', url };
  // A scheme ("x:"), but not a Windows drive letter ("C:\…").
  if (/^[a-z][a-z0-9+.-]+:/i.test(url)) return { kind: 'unsafe', url };
  return { kind: 'file', url };
}

/**
 * The anchor of a heading, as GitHub makes it: lower case, punctuation removed, spaces as
 * hyphens ("Next Steps!" → "next-steps", "다음 단계" → "다음-단계").
 */
export function headingSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const HEADINGS = /^(ATXHeading[1-6]|SetextHeading[12])$/;

/**
 * The headings of a document with their anchors; repeated anchors get -1, -2, … like GitHub.
 * `from` is where each heading starts.
 */
export function headingAnchors(tree: Tree, text: string): { anchor: string; from: number }[] {
  const out: { anchor: string; from: number }[] = [];
  const seen = new Map<string, number>();
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (!HEADINGS.test(node.name)) continue;
    // The heading's own text: without its # marks or its setext underline.
    let title = '';
    let pos = node.from;
    for (const mark of node.getChildren('HeaderMark')) {
      title += text.slice(pos, mark.from);
      pos = mark.to;
    }
    title += text.slice(pos, node.to);
    const base = headingSlug(title.split('\n')[0]!);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.push({ anchor: count ? `${base}-${count}` : base, from: node.from });
  }
  return out;
}
