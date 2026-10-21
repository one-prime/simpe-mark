// Colors inside a formula's TeX, like VS Code colors TeX source: commands, brackets by how
// deeply they nest (bracket pair colorization), and comments. An unmatched brace is an error
// (TeX needs braces balanced); an unmatched ( or [ is not, as in the interval [0, 1).

import type { InlineStyle } from './styles';

/** A run of a formula's source and where it starts in the document (one line of a `$$` block). */
export interface MathPiece {
  from: number;
  text: string;
}

const OPEN = '{([';
const CLOSE = '})]';
const BRACKET_DEPTHS = ['mathBracket1', 'mathBracket2', 'mathBracket3'] as const;
const isLetter = (ch: string | undefined) => ch !== undefined && /[A-Za-z]/.test(ch);

/** Styled ranges of the formula made of `pieces`; brackets pair across pieces. */
export function mathTokens(pieces: readonly MathPiece[]): { from: number; to: number; style: InlineStyle }[] {
  const out: { from: number; to: number; style: InlineStyle }[] = [];
  const brackets: { pos: number; ch: string; open: boolean; paired: boolean }[] = [];
  /** Indices (into `brackets`) of the openers not closed yet. */
  const stack: number[] = [];
  for (const { from, text } of pieces) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === '\\') {
        // \name, or a backslash and one other character (\{, \\, \,).
        let end = i + 1;
        if (isLetter(text[end])) while (isLetter(text[end])) end++;
        else if (end < text.length && text[end] !== '\n') end++;
        out.push({ from: from + i, to: from + end, style: 'mathCommand' });
        i = end - 1;
      } else if (ch === '%') {
        let end = text.indexOf('\n', i);
        if (end === -1) end = text.length;
        out.push({ from: from + i, to: from + end, style: 'mathComment' });
        i = end - 1;
      } else if (OPEN.includes(ch)) {
        stack.push(brackets.push({ pos: from + i, ch, open: true, paired: false }) - 1);
      } else if (CLOSE.includes(ch)) {
        const closer = { pos: from + i, ch, open: false, paired: false };
        brackets.push(closer);
        const want = OPEN[CLOSE.indexOf(ch)];
        // A brace closes past unmatched ( and [; those never close past a brace.
        for (let k = stack.length - 1; k >= 0; k--) {
          const opener = brackets[stack[k]!]!;
          if (opener.ch === want) {
            opener.paired = closer.paired = true;
            stack.length = k;
            break;
          }
          if (opener.ch === '{') break;
        }
      }
    }
  }
  // Pairs nest properly, so depth counts the pairs around each bracket.
  let depth = 0;
  for (const { pos, ch, open, paired } of brackets) {
    if (!paired) {
      if (ch === '{' || ch === '}') out.push({ from: pos, to: pos + 1, style: 'mathBracketError' });
      continue;
    }
    if (!open) depth--;
    out.push({ from: pos, to: pos + 1, style: BRACKET_DEPTHS[depth % 3]! });
    if (open) depth++;
  }
  return out;
}
