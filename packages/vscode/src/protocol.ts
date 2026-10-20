// Messages between the extension host and the editor webview. Positions are line/character
// (both 0-based, characters in UTF-16 units): VS Code counts "\r\n" as two characters and
// CodeMirror as one, so offsets would disagree; lines and characters do not.

export interface LineCh {
  line: number;
  ch: number;
}

/** Replace `from`–`to` (in the document before this edit) with `text`. */
export interface Edit {
  from: LineCh;
  to: LineCh;
  text: string;
}

export type HostMessage =
  /** The document, sent once the webview is ready. */
  | { type: 'init'; text: string; eol: '\n' | '\r\n'; baseUri: string | null; readOnly: boolean }
  /** The document changed outside this webview (undo, another editor, git). */
  | { type: 'update'; text: string }
  /** An `edit` was applied (`ok`) or refused. */
  | { type: 'ack'; ok: boolean };

export type WebviewMessage =
  | { type: 'ready' }
  /** Changes typed in the webview, all relative to the document before them. */
  | { type: 'edit'; edits: Edit[] }
  /** Asks for an `update` with the whole document, to catch up after a conflict. */
  | { type: 'requestText' };
