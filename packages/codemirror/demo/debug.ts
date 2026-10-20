// ?debug: records the first scroll session in a real browser and sends it to the demo server
// (vite.config.ts saves it), to study scrollbar drift that headless tests don't show.

import type { EditorView } from '@codemirror/view';

interface Sample {
  t: number;
  scrollTop: number;
  scrollHeight: number;
}

export function recordScrolling(view: EditorView): void {
  const scroller = view.scrollDOM;
  const start = performance.now();
  const samples: Sample[] = [];
  const heightChanges: Sample[] = [];
  let estimatedTops: number[] | null = null;
  let lastHeight = scroller.scrollHeight;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let sent = false;
  // Slow frames with their breakdown (Chrome's Long Animation Frames API): script time, and
  // when style/layout and rendering started.
  const longFrames: unknown[] = [];
  try {
    new PerformanceObserver((list) => {
      if (!estimatedTops || sent) return;
      for (const e of list.getEntries() as (PerformanceEntry & Record<string, unknown>)[]) {
        const scripts = (e['scripts'] as (PerformanceEntry & Record<string, unknown>)[]) ?? [];
        longFrames.push({
          t: Math.round(e.startTime - start),
          duration: Math.round(e.duration),
          renderStartsAt: Math.round((e['renderStart'] as number) - e.startTime),
          styleAndLayoutStartsAt: Math.round((e['styleAndLayoutStart'] as number) - e.startTime),
          scriptMs: Math.round(scripts.reduce((sum, s) => sum + s.duration, 0)),
          scripts: scripts.slice(0, 3).map((s) => `${Math.round(s.duration)}ms ${String(s['invoker'])} ${String(s['sourceFunctionName'])} ${String(s['sourceURL']).split('/').pop()}`),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    // Not supported (Firefox): the report goes without it.
  }
  const frames: number[] = [];
  let lastFrame = 0;
  const frame = (time: number) => {
    if (estimatedTops && !sent) frames.push(Math.round(time - lastFrame));
    lastFrame = time;
    if (!sent) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const panel = document.body.appendChild(document.createElement('div'));
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10;background:#1f2328;color:#fff;font:13px system-ui;padding:8px 12px;border-radius:6px';
  panel.textContent = 'Debug: drag the scrollbar fast to the bottom (and back), then let go.';

  const lineTops = () => {
    const tops: number[] = [];
    for (let n = 1; n <= view.state.doc.lines; n++) tops.push(Math.round(view.lineBlockAt(view.state.doc.line(n).from).top));
    return tops;
  };
  const now = () => Math.round(performance.now() - start);

  new ResizeObserver(() => {
    if (scroller.scrollHeight !== lastHeight) {
      lastHeight = scroller.scrollHeight;
      heightChanges.push({ t: now(), scrollTop: Math.round(scroller.scrollTop), scrollHeight: lastHeight });
    }
  }).observe(view.contentDOM);

  scroller.addEventListener('scroll', () => {
    if (sent) return;
    // The editor's guesses at the moment the first drag starts, before it draws anything new.
    estimatedTops ??= lineTops();
    samples.push({ t: now(), scrollTop: Math.round(scroller.scrollTop), scrollHeight: scroller.scrollHeight });
    clearTimeout(idle);
    idle = setTimeout(send, 2000);
    panel.textContent = `Debug: recording… ${samples.length} scroll events`;
  });

  function send(): void {
    sent = true;
    const drawnTops = lineTops();
    const lines: { line: number; text: string; estimated: number; drawn: number }[] = [];
    for (let i = 0; i + 1 < drawnTops.length; i++) {
      const estimated = estimatedTops![i + 1]! - estimatedTops![i]!;
      const drawn = drawnTops[i + 1]! - drawnTops[i]!;
      if (Math.abs(estimated - drawn) >= 2) lines.push({ line: i + 1, text: view.state.doc.line(i + 1).text.slice(0, 50), estimated, drawn });
    }
    const style = getComputedStyle(view.contentDOM);
    const report = {
      userAgent: navigator.userAgent,
      devicePixelRatio: devicePixelRatio,
      window: [innerWidth, innerHeight],
      editor: { clientHeight: scroller.clientHeight, contentWidth: view.contentDOM.clientWidth, font: `${style.fontSize} ${style.fontFamily}`, lineHeight: style.lineHeight, defaultLineHeight: view.defaultLineHeight },
      heightAtDragStart: estimatedTops!.at(-1),
      heightAfter: drawnTops.at(-1),
      linesEstimatedWrong: lines.length,
      worstLines: lines.sort((a, b) => Math.abs(b.estimated - b.drawn) - Math.abs(a.estimated - a.drawn)).slice(0, 25),
      frameIntervals: frames,
      longFrames,
      heightChanges,
      samples,
    };
    void fetch('/debug-report', { method: 'POST', body: JSON.stringify(report) }).then(
      (r) => r.text().then((text) => (panel.textContent = r.ok ? `Debug report sent (${text}). Thanks!` : `Debug report failed: ${r.status}`)),
      (error: unknown) => (panel.textContent = `Debug report failed: ${String(error)}`),
    );
  }
}
