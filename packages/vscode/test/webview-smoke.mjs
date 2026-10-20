// Runs the built webview (dist/webview) in Chromium — VS Code webviews are Chromium — with the
// extension's own page and content security policy, and a fake VS Code host. Checks loading,
// math and images under the CSP, edits sent as line/character, and updates from the host.
// Run `npm run build` first. Uses Playwright's cached Chromium (or CHROMIUM_PATH).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import { webviewHtml } from '../src/html.ts';

const root = new URL('..', import.meta.url).pathname;
const images = join(root, '../codemirror/demo/images');
const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), '.cache/ms-playwright');
  for (const dir of existsSync(cache) ? readdirSync(cache).sort().reverse() : []) {
    const path = join(cache, dir, 'chrome-linux64/chrome');
    if (dir.startsWith('chromium-') && existsSync(path)) return path;
  }
  return undefined;
}

const nonce = 'testnonce123';
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = `http://${req.headers.host}`;
  // Browsers ask for a favicon; VS Code webviews don't.
  if (url.pathname === '/favicon.ico') return res.writeHead(204).end();
  if (url.pathname === '/') {
    const page = webviewHtml({ cspSource: origin, scriptUri: '/webview/webview.js', nonce });
    // The fake VS Code API, allowed by the page's nonce like VS Code's own preload script.
    const fake = `<script nonce="${nonce}">
      window.toHost = []; window.cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => cspViolations.push(e.violatedDirective + ' ' + e.blockedURI));
      window.acquireVsCodeApi = () => ({ postMessage: (m) => toHost.push(m) });
    </script>`;
    res.writeHead(200, { 'content-type': 'text/html' }).end(page.replace('<div id="editor">', `${fake}<div id="editor">`));
    return;
  }
  const base = url.pathname.startsWith('/webview/') ? join(root, 'dist') : url.pathname.startsWith('/docs/') ? images : null;
  const file = base && normalize(join(base, url.pathname.replace(/^\/(docs|webview)\//, url.pathname.startsWith('/webview/') ? 'webview/' : '')));
  if (!file || !file.startsWith(base) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const toHost = () => page.evaluate(() => window.toHost.splice(0));
const fromHost = (message) => page.evaluate((m) => window.postMessage(m, '*'), message);

try {
  await page.goto(origin);
  await page.waitForFunction(() => window.toHost.some((m) => m.type === 'ready'));
  check(true, 'webview loads under the CSP and says ready');
  await toHost();

  const text = '# Title\r\n\r\n| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n\r\n![sunset](sunset.png)\r\n\r\n$$\r\n\\mathbb{R}^n\r\n$$\r\n';
  await fromHost({ type: 'init', text, eol: '\r\n', baseUri: `${origin}/docs/`, readOnly: false });
  await page.waitForSelector('.cm-content');
  await page.waitForFunction(() => document.querySelector('.sm-math-preview svg'), null, { timeout: 15000 });
  check(true, 'math renders under the CSP (lazy MathJax chunk and font part)');
  await page.waitForFunction(() => document.querySelector('.sm-image-preview img')?.naturalWidth > 0, null, { timeout: 5000 });
  check(true, 'relative image loads from the document folder');

  // Type at the end of "# Title", then Enter + text: edits must arrive as line/character with CRLF.
  await page.click('.cm-line >> text=Title');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Enter');
  await page.keyboard.type('x');
  const sent = await toHost();
  const edits = sent.filter((m) => m.type === 'edit').flatMap((m) => m.edits);
  check(
    JSON.stringify(edits[0]) === JSON.stringify({ from: { line: 0, ch: 7 }, to: { line: 0, ch: 7 }, text: '!' }),
    `typed "!" sent as line 0, ch 7 (got ${JSON.stringify(edits[0])})`,
  );
  check(edits.some((e) => e.text === '\r\n'), 'Enter sent as "\\r\\n" (the document\'s line ending)');
  for (let i = 0; i < sent.filter((m) => m.type === 'edit').length; i++) await fromHost({ type: 'ack', ok: true });

  // An outside change (e.g. VS Code undo or git) arrives as the whole text.
  const outside = 'Intro\r\n' + text.replace('# Title', '# Title!\r\nx');
  await fromHost({ type: 'update', text: outside });
  await page.waitForTimeout(50);
  const shown = await page.evaluate(() => [...document.querySelectorAll('.cm-line')].slice(0, 3).map((l) => l.textContent));
  check(JSON.stringify(shown) === JSON.stringify(['Intro', '# Title!', 'x']), `outside change merged (${JSON.stringify(shown)})`);
  check((await toHost()).length === 0, 'an update from the host is not sent back');

  // An update that misses edits still on their way must not undo them.
  await page.keyboard.type('y');
  await fromHost({ type: 'update', text: outside });
  await page.waitForTimeout(50);
  const line = await page.evaluate(() => [...document.querySelectorAll('.cm-line')][2].textContent);
  check(line === 'xy', `stale update ignored while an edit is pending (line is ${JSON.stringify(line)})`);
  await toHost();
  await fromHost({ type: 'ack', ok: true });
  await page.waitForTimeout(50);
  check((await toHost()).some((m) => m.type === 'requestText'), 'after the ack it asks for the text again');

  const violations = await page.evaluate(() => window.cspViolations);
  check(violations.length === 0, `no CSP violations ${violations.length ? JSON.stringify(violations) : ''}`);
  check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nwebview smoke test passed');
