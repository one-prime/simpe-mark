// Third-party design notices for the npm libraries. Dependencies ship with their own
// licenses; noBundledPackages fails the release if third-party code would be bundled.
// Values copied from upstream styles are credited below with their full license texts.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const text = (path) => readFileSync(join(root, path), 'utf8').trim();

/** Styles our code copies values from, by key. */
const DESIGN_SOURCES = {
  githubMarkdownCss: { name: 'github-markdown-css', url: 'https://github.com/sindresorhus/github-markdown-css', license: 'MIT', file: 'licenses/github-markdown-css.txt' },
  vscode: { name: 'Visual Studio Code (Code - OSS)', url: 'https://github.com/microsoft/vscode', license: 'MIT', file: 'licenses/vscode.txt' },
  highlightjs: { name: 'highlight.js', url: 'https://github.com/highlightjs/highlight.js', license: 'BSD-3-Clause', file: 'node_modules/highlight.js/LICENSE' },
};

/** What each distributed package copies, by design source. */
export const DESIGN = {
  model: {
    githubMarkdownCss: 'Sizes and colors of the default theme, its syntax colors included (src/theme.ts).',
    vscode: "Default bracket pair colors of VS Code's light theme, for TeX (src/theme.ts).",
  },
  canvas: { githubMarkdownCss: 'Text, marker and error colors (src/layout.ts, src/paint.ts).' },
  codemirror: { githubMarkdownCss: 'Error and loading message colors (src/previews.ts).' },
  highlight: {
    vscode: "The Markdown preview's fence-name renames and its grouping of highlight.js scopes by color (src/index.ts).",
    highlightjs: 'Language names and aliases, generated from its language definitions (src/languages.ts).',
  },
};

const RULE = '='.repeat(78);

/** Credits for the values our packages (`packages/<name>`) copy, merged by source. */
function designSection(names) {
  const uses = new Map();
  for (const name of names) for (const [key, what] of Object.entries(DESIGN[name] ?? {})) uses.set(key, [...(uses.get(key) ?? []), `- ${name}: ${what}`]);
  if (!uses.size) return '';
  const parts = [...uses].map(([key, lines]) => {
    const source = DESIGN_SOURCES[key];
    return `${source.name} (${source.license})\n${source.url}\nUsed for:\n${lines.join('\n')}\n\n${text(source.file)}`;
  });
  return `${RULE}\nDESIGN REFERENCES: values copied into this code\n${RULE}\n\n${parts.join(`\n\n${'-'.repeat(78)}\n\n`)}\n`;
}

/** Design credits for our packages (`own`: names in packages/). */
export function thirdPartyNotices({ title, intro, own }) {
  const sections = [`${title}\n\n${intro}\n`, designSection([...new Set(own)].sort())];
  return sections.filter(Boolean).join('\n');
}

/** The package directory of a bundled module, or null for our own (workspace) files. */
function packageDir(id) {
  const match = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(id.split('?')[0]);
  return match && existsSync(join(match[1], 'package.json')) ? match[1] : null;
}

/** Rolldown plugin: fails the build if any third-party module would be bundled. */
export function noBundledPackages() {
  return {
    name: 'simple-mark-no-bundled-packages',
    generateBundle(_options, bundle) {
      const bundled = Object.values(bundle).flatMap((chunk) => (chunk.moduleIds ?? []).filter(packageDir));
      if (bundled.length) throw new Error(`Third-party code would be bundled (declare it as a dependency): ${bundled.join(', ')}`);
    },
  };
}
