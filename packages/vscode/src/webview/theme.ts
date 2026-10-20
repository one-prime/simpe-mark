// Colors from the user's VS Code theme (CSS variables VS Code sets in every webview), so the
// editor follows light, dark and high-contrast themes and theme switches.

import { EditorView } from '@codemirror/view';
import { defaultTheme, type Theme } from '@simple-mark/model';

const dim = 'var(--vscode-descriptionForeground)';
const codeBackground = 'var(--vscode-textCodeBlock-background)';

export const vscodeTheme: Theme = {
  ...defaultTheme,
  fontFamily: 'var(--vscode-font-family)',
  // Kept as font names: the editor measures this font to align Korean in tables.
  monospaceFamily: defaultTheme.monospaceFamily,
  color: 'var(--vscode-editor-foreground)',
  block: {
    ...defaultTheme.block,
    quote: { color: dim, borderLeft: 'var(--vscode-textBlockQuote-border)' },
    codeblock: { monospace: true, lineBackground: codeBackground },
    mathblock: { monospace: true, color: 'var(--vscode-textPreformat-foreground)' },
    tableRowAlt: { lineBackground: 'color-mix(in srgb, var(--vscode-editor-foreground) 5%, transparent)' },
    h6: { fontWeight: 700, color: dim },
  },
  inline: {
    ...defaultTheme.inline,
    link: { color: 'var(--vscode-textLink-foreground)' },
    code: { monospace: true, background: codeBackground },
    math: { monospace: true, color: 'var(--vscode-textPreformat-foreground)' },
    url: { color: dim, underline: true },
    mark: { ...defaultTheme.inline.mark, color: dim },
  },
};

/** Editor chrome (background, cursor, selection, tooltips) in the theme's colors. */
export const vscodeChrome = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--vscode-editor-font-size)', backgroundColor: 'var(--vscode-editor-background)' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': { padding: '16px 24px', maxWidth: '920px', caretColor: 'var(--vscode-editorCursor-foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vscode-editorCursor-foreground)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--vscode-editor-selectionBackground)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--vscode-editorHoverWidget-background)',
    color: 'var(--vscode-editorHoverWidget-foreground)',
    border: '1px solid var(--vscode-editorHoverWidget-border)',
  },
  '.sm-image-error, .sm-math-error': { color: 'var(--vscode-errorForeground)' },
});
