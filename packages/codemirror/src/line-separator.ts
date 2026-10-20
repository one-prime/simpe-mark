import { EditorState, type Extension } from '@codemirror/state';

/**
 * Keeps a file's line endings. CodeMirror otherwise reads \r\n and \r as \n and writes \n,
 * so a Windows file would not save back byte for byte. Read the text back with
 * `state.sliceDoc()`, not `doc.toString()` (which always joins lines with \n).
 */
export function keepLineSeparator(text: string): Extension {
  const separator = text.includes('\r\n') ? '\r\n' : text.includes('\r') ? '\r' : null;
  return separator ? EditorState.lineSeparator.of(separator) : [];
}
