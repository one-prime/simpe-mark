// The extension host side: a custom text editor for Markdown. VS Code's TextDocument stays
// the source of truth, so saving, the dirty mark, git and undo/redo work as for any text
// editor; the webview only shows it and sends the user's edits.

import * as vscode from 'vscode';
import { makeNonce, webviewHtml } from './html';
import type { HostMessage, WebviewMessage } from './protocol';

const VIEW_TYPE = 'simplemark.editor';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new SimpleMarkEditorProvider(context.extensionUri), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand('simplemark.open', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) void vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
    }),
    vscode.commands.registerCommand('simplemark.openAsText', (uri?: vscode.Uri) => {
      const target = uri ?? activeCustomEditorUri();
      if (target) void vscode.commands.executeCommand('vscode.openWith', target, 'default');
    }),
  );
}

export function deactivate(): void {}

function activeCustomEditorUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom ? input.uri : undefined;
}

class SimpleMarkEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const { webview } = panel;
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
    // Images may come from the document's folder and the workspace; nothing else on disk.
    const folder = document.uri.scheme === 'untitled' ? null : vscode.Uri.joinPath(document.uri, '..');
    const workspace = vscode.workspace.getWorkspaceFolder(document.uri)?.uri;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [dist, ...(folder ? [folder] : []), ...(workspace ? [workspace] : [])],
    };
    webview.html = webviewHtml({
      cspSource: webview.cspSource,
      scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview', 'webview.js')).toString(),
      nonce: makeNonce(),
    });

    const post = (message: HostMessage) => void webview.postMessage(message);
    // Edits from this webview are applied one at a time; while one is being applied, the
    // change event it causes is not echoed back.
    let applying = 0;
    let queue = Promise.resolve();

    const apply = async (message: Extract<WebviewMessage, { type: 'edit' }>) => {
      const edit = new vscode.WorkspaceEdit();
      for (const { from, to, text } of message.edits) edit.replace(document.uri, new vscode.Range(from.line, from.ch, to.line, to.ch), text);
      applying++;
      let ok = false;
      try {
        ok = await vscode.workspace.applyEdit(edit);
      } finally {
        applying--;
      }
      post({ type: 'ack', ok });
    };

    const subscriptions = [
      webview.onDidReceiveMessage((message: WebviewMessage) => {
        switch (message.type) {
          case 'ready':
            post({
              type: 'init',
              text: document.getText(),
              eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
              baseUri: folder ? `${webview.asWebviewUri(folder).toString()}/` : null,
              readOnly: vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) === false,
            });
            break;
          case 'edit':
            queue = queue.then(() => apply(message));
            break;
          case 'requestText':
            post({ type: 'update', text: document.getText() });
            break;
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString() || !event.contentChanges.length || applying > 0) return;
        post({ type: 'update', text: document.getText() });
      }),
    ];
    panel.onDidDispose(() => subscriptions.forEach((s) => s.dispose()));
  }
}
