// The webview page. No VS Code import, so the browser test serves exactly this page and
// content security policy.

export interface PageOptions {
  /** `webview.cspSource`: the origin webview resources are served from. */
  cspSource: string;
  /** URL of the bundled editor script. */
  scriptUri: string;
  /** A fresh random value for each page. */
  nonce: string;
}

/**
 * Scripts: the editor bundle and its lazy chunks (math), from the extension only. Styles:
 * CodeMirror adds <style> elements and the editor styles text with style attributes, so
 * 'unsafe-inline' is needed for styles (not for scripts). Images: the extension, the
 * document's folders (the host limits those with localResourceRoots), https and data URLs.
 */
export function webviewHtml({ cspSource, scriptUri, nonce }: PageOptions): string {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} https: data:`,
    `font-src ${cspSource}`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html, body { height: 100%; margin: 0; padding: 0; }
  body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  #editor { height: 100%; }
</style>
</head>
<body>
<div id="editor"></div>
<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/** A random nonce for the page's script. */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
