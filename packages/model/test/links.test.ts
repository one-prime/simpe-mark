import { describe, expect, it } from 'vitest';
import { headingAnchors, headingSlug, linkAt, linkKind, markdownParser } from '../src/index';

/** The link at the "^" in `doc`. */
function at(doc: string) {
  const pos = doc.indexOf('^');
  const text = doc.slice(0, pos) + doc.slice(pos + 1);
  const link = linkAt(markdownParser.parse(text), text, pos);
  return link && { kind: link.kind, target: link.target, text: text.slice(link.from, link.to) };
}

describe('linkAt', () => {
  it('finds inline links and images, on their text or their target', () => {
    expect(at('see [the ^docs](https://x.y/docs) now')).toEqual({ kind: 'link', target: 'https://x.y/docs', text: '[the docs](https://x.y/docs)' });
    expect(at('see [docs](https://x.^y) now')).toMatchObject({ target: 'https://x.y' });
    expect(at('![a ^map](img/map.png "Map")')).toEqual({ kind: 'image', target: 'img/map.png', text: '![a map](img/map.png "Map")' });
    expect(at('[x](<my file.md>^)')).toMatchObject({ target: 'my file.md' });
  });

  it('follows references to their definitions', () => {
    expect(at('[the ^logo][logo]\n\n[logo]: ./logo.svg')).toMatchObject({ target: './logo.svg' });
    expect(at('[^Logo][]\n\n[logo]: a.png')).toMatchObject({ target: 'a.png' });
    expect(at('[^missing][nope]')).toMatchObject({ target: null });
    expect(at('[logo]: ./lo^go.svg')).toMatchObject({ kind: 'link', target: './logo.svg' });
  });

  it('finds autolinks and bare URLs', () => {
    expect(at('<https://a.^b>')).toMatchObject({ target: 'https://a.b' });
    expect(at('go to www.exa^mple.com today')).toMatchObject({ target: 'www.example.com', text: 'www.example.com' });
  });

  it('finds nothing outside links', () => {
    expect(at('plain ^text [x](y)')).toBeNull();
    expect(at('`[x](^y)`')).toBeNull();
  });
});

describe('linkKind', () => {
  it('sorts targets into web, anchor, file and unsafe', () => {
    expect(linkKind('https://x.y')).toEqual({ kind: 'web', url: 'https://x.y' });
    expect(linkKind('www.x.y')).toEqual({ kind: 'web', url: 'https://www.x.y' });
    expect(linkKind('mailto:a@b.c')).toEqual({ kind: 'web', url: 'mailto:a@b.c' });
    expect(linkKind('a@b.c')).toEqual({ kind: 'web', url: 'mailto:a@b.c' });
    expect(linkKind('#next-steps')).toEqual({ kind: 'anchor', url: '#next-steps' });
    expect(linkKind('img/map.png')).toEqual({ kind: 'file', url: 'img/map.png' });
    expect(linkKind('../notes/b.md')).toEqual({ kind: 'file', url: '../notes/b.md' });
    expect(linkKind('C:\\notes\\b.md').kind).toBe('file');
    for (const unsafe of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'vscode://x']) expect(linkKind(unsafe).kind).toBe('unsafe');
  });
});

describe('heading anchors', () => {
  it('makes GitHub-style anchors, Korean included, numbering repeats', () => {
    expect(headingSlug('Next Steps!')).toBe('next-steps');
    expect(headingSlug('다음 단계')).toBe('다음-단계');
    const text = '# Intro\n\n## Next Steps!\n\nTitle\n---\n\n## Intro';
    expect(headingAnchors(markdownParser.parse(text), text)).toEqual([
      { anchor: 'intro', from: 0 },
      { anchor: 'next-steps', from: 9 },
      { anchor: 'title', from: 25 },
      { anchor: 'intro-1', from: 36 },
    ]);
  });
});
