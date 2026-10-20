// What every renderer previews below the source: the images of each line and closed `$$`
// blocks. Shared by the CodeMirror editor and the canvas renderer, so both preview the same.

import type { SyntaxNode, Tree } from '@lezer/common';

/** An image as written in the document. */
export interface ImageSource {
  alt: string;
  /** The path as written, or null when a reference has no definition. */
  src: string | null;
  /** For messages: the path, or the reference label (`[logo]`) that has no definition. */
  raw: string;
}

/** A preview drawn below the line that ends at `at` (an offset in the text). */
export type PreviewBlock = { at: number; images: ImageSource[] } | { at: number; tex: string };

/** A reference label (`[Logo]`) as definitions are looked up: case and spacing ignored. */
export const normalizeLabel = (label: string) => label.slice(1, -1).trim().replace(/\s+/g, ' ').toLowerCase();

/** A link destination as written, without the optional angle brackets (`<a b.png>`). */
export const destination = (text: string, url: SyntaxNode) => text.slice(url.from, url.to).replace(/^<(.*)>$/, '$1');

/** Link reference definitions (`[label]: url`) of the document, by normalized label. */
export function linkDefinitions(tree: Tree, text: string): Map<string, string> {
  const definitions = new Map<string, string>();
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'LinkReference') continue;
    const label = node.getChild('LinkLabel');
    const url = node.getChild('URL');
    if (label && url) {
      const key = normalizeLabel(text.slice(label.from, label.to));
      if (!definitions.has(key)) definitions.set(key, destination(text, url));
    }
  }
  return definitions;
}

function imageSource(node: SyntaxNode, text: string, definitions: Map<string, string>): ImageSource {
  const marks = node.getChildren('LinkMark');
  const alt = marks.length >= 2 ? text.slice(marks[0]!.to, marks[1]!.from) : '';
  const url = node.getChild('URL');
  if (url) {
    const src = destination(text, url);
    return { alt, src, raw: src };
  }
  // [alt][label], [alt][] or [alt]: the label names a definition.
  const label = node.getChild('LinkLabel');
  const labelText = label && label.to - label.from > 2 ? text.slice(label.from, label.to) : `[${alt}]`;
  const src = definitions.get(normalizeLabel(labelText));
  return src === undefined ? { alt, src: null, raw: labelText } : { alt, src, raw: src };
}

/**
 * The TeX of a math node (`InlineMath` or `BlockMath`), without delimiters or quote markers;
 * null while it is not closed. `slice` reads the document.
 */
export function mathSource(node: SyntaxNode, slice: (from: number, to: number) => string): string | null {
  const marks = node.getChildren('MathMark');
  if (marks.length < 2) return null;
  if (node.name === 'InlineMath') return slice(marks[0]!.to, marks[1]!.from);
  return node
    .getChildren('MathText')
    .map((part) => slice(part.from, part.to))
    .join('\n');
}

/**
 * The previews of a document: the images of each line (one entry per line, in order) and
 * closed, non-empty `$$` blocks. `text` must use one character per line break ("\n"), so
 * offsets match the tree.
 */
export function previewBlocks(tree: Tree, text: string): PreviewBlock[] {
  const definitions = linkDefinitions(tree, text);
  const lineEnd = (pos: number) => {
    const end = text.indexOf('\n', pos);
    return end === -1 ? text.length : end;
  };
  const imagesByLine = new Map<number, ImageSource[]>();
  const blocks: PreviewBlock[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === 'Image') {
        const at = lineEnd(node.to);
        let images = imagesByLine.get(at);
        if (!images) {
          imagesByLine.set(at, (images = []));
          blocks.push({ at, images });
        }
        images.push(imageSource(node.node, text, definitions));
        return false;
      }
      if (node.name === 'BlockMath') {
        const tex = mathSource(node.node, (from, to) => text.slice(from, to));
        if (tex !== null && tex.trim()) blocks.push({ at: lineEnd(node.to), tex });
        return false;
      }
      return undefined;
    },
  });
  return blocks;
}
