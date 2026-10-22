import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { commonmarkLanguage, markdown } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultTheme, markdownExtensions, type Theme } from '@simple-mark/model';
import { markdownDecorations, markdownTheme } from './decorations';
import { keepLineSeparator } from './line-separator';
import { linkOpener, links, type LinkOpener } from './links';
import { imageResolver, previews, type ImageResolver } from './previews';
import { tabKey } from './tab-key';
import { tableEditing } from './table-commands';

export type { LinkOpener, LinkTarget } from './links';
export { refreshImages, type ImageResolver } from './image-resolver';

/** The language, styling and interactions shared by the browser and DrawLayout. */
function simpleMark(theme: Theme): Extension {
  return [
    // Before markdown(): its Enter (continue list/quote markup) has the same precedence.
    tableEditing(),
    tabKey(),
    markdown({ base: commonmarkLanguage, extensions: markdownExtensions, completeHTMLTags: false }),
    markdownTheme.of(theme),
    markdownDecorations,
    previews(),
    links(),
    EditorView.theme({
      '&': { color: theme.color },
      '.cm-scroller': { fontFamily: theme.fontFamily, lineHeight: '1.6' },
    }),
  ];
}

export interface EditorOptions {
  doc?: string;
  theme?: Theme;
  /**
   * Turns an image path from the document into a URL to load (default: as written). Return
   * undefined while the file is still loading, and call `refreshImages(view)` when it has.
   */
  resolveImage?: ImageResolver;
  /**
   * Opens a followed link (Ctrl/Cmd+Click) or a clicked image preview. Default: web addresses
   * and paths (resolved like images) in a new browser tab.
   */
  openLink?: LinkOpener;
  /** Called after every change with the full text, in the original line endings. */
  onChange?: (text: string) => void;
  extensions?: Extension[];
}

/** A Markdown editor in `parent`. The text is kept exactly as given, line endings included. */
export function createEditor(parent: HTMLElement, options: EditorOptions = {}): EditorView {
  const { doc = '', theme = defaultTheme, resolveImage, openLink, onChange, extensions = [] } = options;
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        keepLineSeparator(doc),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        simpleMark(theme),
        resolveImage ? imageResolver.of(resolveImage) : [],
        openLink ? linkOpener.of(openLink) : [],
        onChange ? EditorView.updateListener.of((update) => update.docChanged && onChange(update.state.sliceDoc())) : [],
        extensions,
      ],
    }),
  });
}
