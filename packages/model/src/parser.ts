import { GFM, parser, type MarkdownExtension } from '@lezer/markdown';

/** The Markdown flavor every SimpleMark renderer parses: CommonMark + GFM. */
export const markdownExtensions: MarkdownExtension[] = [GFM];

/** A Lezer parser for that flavor, for hosts without CodeMirror (e.g. a canvas renderer). */
export const markdownParser = parser.configure(markdownExtensions);
