// The webview side: a SimpleMark editor kept equal to the VS Code document. Typed changes go
// to the host as line/character edits; changes from VS Code (undo, other editors, git) come
// back as the whole text and are merged in as one minimal change, keeping the cursor.

import { Annotation } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createEditor } from '@simplemark/codemirror';
import type { Edit, HostMessage, WebviewMessage } from '../protocol';
import { diffText, offsetToLineCh } from '../sync';
import { vscodeChrome, vscodeTheme } from './theme';

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

const vscode = acquireVsCodeApi();
const post = (message: WebviewMessage) => vscode.postMessage(message);

/** Marks transactions that come from the host, so they are not sent back. */
const fromHost = Annotation.define<boolean>();

let view: EditorView | null = null;
/** Edits sent and not yet acknowledged. */
let pending = 0;
/** An update arrived while edits were pending; ask for the text once they are applied. */
let stale = false;

/** Image paths relative to the document's folder; web images as they are; other schemes refused. */
function imageResolver(baseUri: string | null) {
  return (src: string): string | null => {
    if (/^(https?:|data:image\/)/i.test(src)) return src;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || !baseUri) return null;
    try {
      return new URL(src, baseUri).toString();
    } catch {
      return null;
    }
  };
}

/** Sends each typed change to the host, one message per transaction, in order. */
const sendEdits = EditorView.updateListener.of((update) => {
  for (const tr of update.transactions) {
    if (!tr.docChanged || tr.annotation(fromHost)) continue;
    const before = tr.startState.doc;
    const edits: Edit[] = [];
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const from = before.lineAt(fromA);
      const to = before.lineAt(toA);
      edits.push({
        from: { line: from.number - 1, ch: fromA - from.from },
        to: { line: to.number - 1, ch: toA - to.from },
        text: inserted.sliceString(0, inserted.length, tr.state.lineBreak),
      });
    });
    pending++;
    post({ type: 'edit', edits });
  }
});

function start(message: Extract<HostMessage, { type: 'init' }>): void {
  view = createEditor(document.getElementById('editor')!, {
    doc: message.text,
    lineSeparator: message.eol,
    readOnly: message.readOnly,
    theme: vscodeTheme,
    history: false, // VS Code owns undo/redo for the document
    resolveImage: imageResolver(message.baseUri),
    extensions: [vscodeChrome, sendEdits],
  });
  view.focus();
}

/** Makes the editor show `text`, changing only what differs. */
function reconcile(text: string): void {
  if (!view) return;
  const { state } = view;
  const current = state.sliceDoc();
  const diff = diffText(current, text);
  if (!diff) return;
  const toPos = (offset: number) => {
    const { line, ch } = offsetToLineCh(current, offset, state.lineBreak);
    return state.doc.line(line + 1).from + ch;
  };
  view.dispatch({ changes: { from: toPos(diff.from), to: toPos(diff.to), insert: diff.insert }, annotations: fromHost.of(true) });
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      if (!view) start(message);
      break;
    case 'update':
      // Our own edits are still on their way: this text may not have them yet.
      if (pending > 0) stale = true;
      else reconcile(message.text);
      break;
    case 'ack':
      pending--;
      if (!message.ok) stale = true;
      if (pending === 0 && stale) {
        stale = false;
        post({ type: 'requestText' });
      }
      break;
  }
});

post({ type: 'ready' });
