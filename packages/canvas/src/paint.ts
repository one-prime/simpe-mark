// Draws a laid-out Markdown text with Canvas 2D, at the layout's origin (0, 0).

import { charWidth } from '@simple-mark/model';
import type { MarkdownLayout } from './layout';

export interface PaintSources {
  /** A loaded image for a path as written; null or undefined while it can't be drawn. */
  image?: (src: string) => CanvasImageSource | null | undefined;
  /** Display math as an image in `color`, or its error message (see `createMathImages`). */
  math?: (tex: string, color: string) => CanvasImageSource | string | null | undefined;
}

const PLACEHOLDER = 'rgba(129, 139, 152, 0.15)';

/**
 * Where text sits in its line, as a browser places it: the line's extra height (half-leading)
 * split above and below the ascent + descent of the line's font, every run on that baseline.
 * Falls back to the layout's estimate where a browser doesn't give font metrics.
 */
function baseline(ctx: CanvasRenderingContext2D, run: { top: number; height: number; textTop: number; lineFont: string }): { y: number; alphabetic: boolean } {
  // Font metrics are measured from the current textBaseline: measure from the alphabetic one,
  // whatever the caller's canvas was left at (a host drawing plain text with "top", say).
  ctx.textBaseline = 'alphabetic';
  ctx.font = run.lineFont;
  const metrics = ctx.measureText('x');
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  if (!(ascent > 0) || !(descent >= 0)) return { y: run.textTop, alphabetic: false };
  return { y: run.top + (run.height - (ascent + descent)) / 2 + ascent, alphabetic: true };
}

/** A filled rectangle with rounded corners (top-left, top-right, bottom-right, bottom-left). */
function fillBox(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number | [number, number, number, number]): void {
  const radii = typeof radius === 'number' ? [radius, radius, radius, radius] : radius;
  if (!radii.some((r) => r > 0) || !ctx.roundRect) {
    ctx.fillRect(x, y, width, height);
    return;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radii.map((r) => Math.min(r, width / 2, height / 2)));
  ctx.fill();
}

export function paintMarkdown(ctx: CanvasRenderingContext2D, layout: MarkdownLayout, sources: PaintSources = {}, color = '#1f2328'): void {
  ctx.save();
  ctx.textAlign = 'left';

  for (const line of layout.lines) {
    if (line.background) {
      ctx.fillStyle = line.background;
      fillBox(ctx, 0, line.top, layout.width, line.height, line.radius ? [line.radius.top, line.radius.top, line.radius.bottom, line.radius.bottom] : 0);
    }
    if (line.rule) {
      ctx.fillStyle = line.rule.color;
      ctx.fillRect(0, line.top + (line.height - line.rule.width) / 2, layout.width, line.rule.width);
    }
    if (line.bar) {
      ctx.fillStyle = line.bar.color;
      ctx.fillRect(0, line.top, line.bar.width, line.height);
    }
    if (line.border) {
      ctx.fillStyle = line.border.color;
      ctx.fillRect(0, line.top + line.height - line.border.width, layout.width, line.border.width);
    }
  }

  // Backgrounds first, one box for neighbouring runs with the same one (inline code with its
  // backticks), so its corners are rounded only at its ends.
  for (let i = 0; i < layout.runs.length; ) {
    const run = layout.runs[i]!;
    let end = run.x + run.width;
    let j = i + 1;
    if (run.background) {
      for (; j < layout.runs.length; j++) {
        const next = layout.runs[j]!;
        if (next.background !== run.background || next.top !== run.top || Math.abs(next.x - end) > 0.5) break;
        end = next.x + next.width;
      }
      ctx.fillStyle = run.background;
      fillBox(ctx, run.x, run.textTop - run.fontSize * 0.1, end - run.x, run.fontSize * 1.2, run.radius ?? 0);
    }
    i = j;
  }

  for (const run of layout.runs) {
    const { y, alphabetic } = baseline(ctx, run);
    ctx.font = run.font;
    ctx.textBaseline = alphabetic ? 'alphabetic' : 'top';
    ctx.fillStyle = run.color;
    if (run.column) {
      // Tables: every character on the column grid, wide ones centered in two columns.
      let x = run.x;
      for (const ch of run.text) {
        const cell = charWidth(ch.codePointAt(0)!) * run.column;
        ctx.fillText(ch, x + (cell - ctx.measureText(ch).width) / 2, y);
        x += cell;
      }
    } else {
      ctx.fillText(run.text, run.x, y);
    }
    if (run.strike || run.underline) {
      ctx.fillStyle = run.color;
      const thickness = Math.max(run.fontSize / 15, 0.5);
      // From the baseline: a strike through the middle of lower-case letters, an underline below.
      const strikeY = alphabetic ? y - run.fontSize * 0.3 : run.textTop + run.fontSize * 0.55;
      const underlineY = alphabetic ? y + run.fontSize * 0.12 : run.textTop + run.fontSize * 1.02;
      if (run.strike) ctx.fillRect(run.x, strikeY, run.width, thickness);
      if (run.underline) ctx.fillRect(run.x, underlineY, run.width, thickness);
    }
  }

  const message = (text: string, x: number, y: number, fill: string) => {
    ctx.textBaseline = 'top';
    ctx.font = layout.message.font;
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };
  for (const box of layout.boxes) {
    if (box.kind === 'image') {
      const image = box.status === 'ready' && box.src !== null ? sources.image?.(box.src) : null;
      if (image) ctx.drawImage(image, box.x, box.y, box.width, box.height);
      else if (box.status === 'missing') message(box.src === null ? `No definition for ${box.raw}` : `Image not found: ${box.raw}`, box.x, box.y, layout.message.error);
      else {
        ctx.fillStyle = PLACEHOLDER;
        ctx.fillRect(box.x, box.y, box.width, box.height);
        if (box.alt) message(box.alt, box.x + 6, box.y + 6, layout.message.dim);
      }
    } else {
      const math = sources.math?.(box.tex, color);
      if (typeof math === 'string') message(`Math error: ${math}`, box.x, box.y, layout.message.error);
      else if (math && box.status === 'ready') ctx.drawImage(math, box.x, box.y, box.width, box.height);
      else if (box.status === 'error') message('Math error', box.x, box.y, layout.message.error);
    }
  }
  ctx.restore();
}
