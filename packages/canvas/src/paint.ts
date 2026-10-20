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

export function paintMarkdown(ctx: CanvasRenderingContext2D, layout: MarkdownLayout, sources: PaintSources = {}, color = '#1f2328'): void {
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  for (const line of layout.lines) {
    if (line.background) {
      ctx.fillStyle = line.background;
      ctx.fillRect(0, line.top, layout.width, line.height);
    }
    if (line.bar) {
      ctx.fillStyle = line.bar.color;
      ctx.fillRect(0, line.top, line.bar.width, line.height);
    }
  }

  for (const run of layout.runs) {
    ctx.font = run.font;
    if (run.background) {
      ctx.fillStyle = run.background;
      ctx.fillRect(run.x, run.textTop - run.fontSize * 0.1, run.width, run.fontSize * 1.2);
    }
    ctx.fillStyle = run.color;
    if (run.column) {
      // Tables: every character on the column grid, wide ones centered in two columns.
      let x = run.x;
      for (const ch of run.text) {
        const cell = charWidth(ch.codePointAt(0)!) * run.column;
        ctx.fillText(ch, x + (cell - ctx.measureText(ch).width) / 2, run.textTop);
        x += cell;
      }
    } else {
      ctx.fillText(run.text, run.x, run.textTop);
    }
    if (run.strike || run.underline) {
      ctx.fillStyle = run.color;
      const thickness = Math.max(run.fontSize / 15, 0.5);
      if (run.strike) ctx.fillRect(run.x, run.textTop + run.fontSize * 0.55, run.width, thickness);
      if (run.underline) ctx.fillRect(run.x, run.textTop + run.fontSize * 1.02, run.width, thickness);
    }
  }

  const message = (text: string, x: number, y: number, fill: string) => {
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
