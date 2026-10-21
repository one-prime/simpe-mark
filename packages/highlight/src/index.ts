// Code block colors with highlight.js, the highlighter of VS Code's Markdown preview: the same
// fence names find the same languages and the same text gets colored. No DOM: highlight.js's
// HTML is read back into ranges with @simple-mark/model's code styles, so the editor and a
// canvas draw them alike. Languages load the first time a block needs them.

import core from 'highlight.js/lib/core';
import type { CodeToken, InlineStyle } from '@simple-mark/model';
import { LANGUAGES } from './languages';

export { LANGUAGES } from './languages';

/** Our own instance: a host's highlight.js keeps its own languages. */
const hljs = core.newInstance();

/** What VS Code's preview does to a fence name before asking highlight.js (normalizeHighlightLang). */
const PREVIEW_NAMES: Record<string, string> = {
  shell: 'sh',
  py3: 'python',
  tsx: 'jsx',
  typescriptreact: 'jsx',
  json5: 'json',
  jsonc: 'json',
  'c#': 'cs',
  csharp: 'cs',
};

// With every language registered (as in the preview), a later language's alias wins.
const aliases = new Map<string, string>();
for (const [name, entry] of Object.entries(LANGUAGES)) for (const alias of entry.aliases ?? []) aliases.set(alias, name);

/** The language of a fence's info string ("ts", "js title=x"), as the preview picks it. */
export function languageOf(info: string): string | undefined {
  const word = info.trim().split(/\s+/)[0]!.toLowerCase();
  const name = PREVIEW_NAMES[word] ?? word;
  return Object.hasOwn(LANGUAGES, name) ? name : aliases.get(name);
}

/**
 * Style of each highlight.js scope, grouped as the preview's highlight.css colors them. null:
 * plain, also inside a colored scope (`${…}` in a string). Scopes not listed (operator,
 * punctuation, property, a sublanguage) take the color around them.
 */
const SCOPE_STYLES: Record<string, InlineStyle | null> = {
  keyword: 'codeKeyword',
  literal: 'codeLiteral',
  symbol: 'codeLiteral',
  link: 'codeLiteral',
  built_in: 'codeType',
  type: 'codeType',
  class: 'codeType',
  number: 'codeNumber',
  string: 'codeString',
  regexp: 'codeString',
  char: 'codeString',
  'template-tag': 'codeString',
  comment: 'codeComment',
  quote: 'codeComment',
  doctag: 'codeComment',
  title: 'codeTitle',
  meta: 'codeMeta',
  tag: 'codeMeta',
  variable: 'codeVariable',
  'template-variable': 'codeVariable',
  attr: 'codeAttr',
  attribute: 'codeAttr',
  name: 'codeTag',
  'selector-tag': 'codeTag',
  section: 'codeSection',
  bullet: 'codeSelector',
  'selector-id': 'codeSelector',
  'selector-class': 'codeSelector',
  'selector-attr': 'codeSelector',
  'selector-pseudo': 'codeSelector',
  addition: 'codeAddition',
  deletion: 'codeDeletion',
  emphasis: 'em',
  strong: 'strong',
  subst: null,
  params: null,
  function: null,
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" };
const HTML_PART = /<span class="([^"]*)">|<\/span>|&(amp|lt|gt|quot|#x27);|[^<&]+/g;

/** highlight.js's HTML as its text and styled ranges; the innermost colored scope wins. */
function readHtml(html: string): { text: string; tokens: CodeToken[] } {
  /** Per open span: its style, null for plain, undefined to keep the color around it. */
  const open: (InlineStyle | null | undefined)[] = [];
  const tokens: CodeToken[] = [];
  let text = '';
  for (const [part, classes, entity] of html.matchAll(HTML_PART)) {
    if (classes !== undefined) {
      const scope = classes.split(' ')[0]!;
      open.push(scope.startsWith('hljs-') ? SCOPE_STYLES[scope.slice(5)] : undefined);
    } else if (part === '</span>') {
      open.pop();
    } else {
      const piece = entity ? ENTITIES[entity]! : part;
      let style: InlineStyle | null | undefined;
      for (let i = open.length - 1; style === undefined && i >= 0; i--) style = open[i];
      const last = tokens.at(-1);
      if (style && last?.to === text.length && last.style === style) last.to += piece.length;
      else if (style) tokens.push({ from: text.length, to: text.length + piece.length, style });
      text += piece;
    }
  }
  return { text, tokens };
}

const cache = new Map<string, CodeToken[]>();
const CACHE_SIZE = 500;

/** The colors of `code` in a registered language. */
function highlight(code: string, language: string): CodeToken[] {
  const key = `${language}\n${code}`;
  let tokens = cache.get(key);
  if (!tokens) {
    const { text, tokens: read } = readHtml(hljs.highlight(code, { language, ignoreIllegals: true }).value);
    // Never color the wrong characters, should the HTML ever hold something unexpected.
    tokens = text === code ? read : [];
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(key, tokens);
  }
  return tokens;
}

const loading = new Map<string, Promise<void>>();
/** Languages registered with all they embed. */
const ready = new Set<string>();

/** Registers a language and those it embeds (HTML: CSS and JavaScript). */
function loadLanguage(name: string): Promise<void> {
  let promise = loading.get(name);
  if (!promise) {
    const entry = LANGUAGES[name]!;
    const own = entry.load().then((module) => {
      hljs.registerLanguage(name, module.default);
      // Blocks colored before an embedded language arrived lack its colors.
      cache.clear();
    });
    // Set before loading the embedded ones, which may embed this one again (JSX and HTML).
    loading.set(name, own);
    promise = Promise.all([own, ...(entry.uses ?? []).map(loadLanguage)]).then(() => {
      ready.add(name);
    });
    loading.set(name, promise);
  }
  return promise;
}

/**
 * A `highlight` function for `markdownStyles`. A block whose language has not loaded yet stays
 * plain; the language starts loading and `onReady` is called when it has, to draw again.
 */
export function createHighlighter(onReady: () => void): (code: string, info: string) => CodeToken[] | undefined {
  const requested = new Set<string>();
  return (code, info) => {
    const language = languageOf(info);
    if (!language) return undefined;
    if (!ready.has(language) && !requested.has(language)) {
      requested.add(language);
      loadLanguage(language).then(onReady, (error: unknown) => console.warn(`Could not load highlighting for ${language}`, error));
    }
    return hljs.getLanguage(language) ? highlight(code, language) : undefined;
  };
}

/** Loads the languages of these fence info strings, for hosts that draw once (a CLI render). */
export async function loadLanguages(infos: Iterable<string>): Promise<void> {
  const names = new Set([...infos].map(languageOf).filter((name) => name !== undefined));
  await Promise.all([...names].map(loadLanguage));
}
