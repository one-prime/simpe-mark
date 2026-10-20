import { GFM, parser, type MarkdownExtension } from '@lezer/markdown';
import { MathSyntax } from './math-syntax';

/** The Markdown flavor every SimpleMark renderer parses: CommonMark + GFM + $math$. */
export const markdownExtensions: MarkdownExtension[] = [GFM, MathSyntax];

/** A Lezer parser for that flavor, for hosts without CodeMirror (e.g. a canvas renderer). */
export const markdownParser = parser.configure(markdownExtensions);
