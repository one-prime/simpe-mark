import { describe, expect, it } from 'vitest';
import { layoutMarkdown, paintMarkdown } from '../src/index';

/**
 * A canvas that records fillText calls. Like a real one, its font metrics are measured from the
 * current textBaseline (from "top", the ascent is about 0).
 */
function recordingCanvas(textBaseline: CanvasTextBaseline) {
  const drawn: { text: string; y: number; baseline: CanvasTextBaseline }[] = [];
  const ctx = {
    textBaseline,
    textAlign: 'left',
    font: '',
    fillStyle: '',
    save() {},
    restore() {},
    fillRect() {},
    measureText(text: string) {
      const top = this.textBaseline === 'top';
      return { width: text.length * 10, fontBoundingBoxAscent: top ? 0.1 : 16, fontBoundingBoxDescent: top ? 20 : 4 };
    },
    fillText(text: string, _x: number, y: number) {
      drawn.push({ text, y, baseline: this.textBaseline });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}

describe('paintMarkdown', () => {
  it('places every run on the same baseline, whatever textBaseline the canvas was left at', () => {
    const layout = layoutMarkdown('# Room 3', {
      width: 400,
      style: { fontFamily: 'sans-serif', fontSize: 20, fontWeight: 400, lineHeight: 1.5, color: '#000' },
      measure: (text) => text.length * 10,
    });
    for (const left of ['top', 'alphabetic', 'middle'] as const) {
      const { ctx, drawn } = recordingCanvas(left);
      paintMarkdown(ctx, layout);
      expect(drawn.map((d) => d.text)).toEqual(['#', ' Room 3']);
      expect(new Set(drawn.map((d) => d.y)).size).toBe(1);
      expect(drawn.every((d) => d.baseline === 'alphabetic')).toBe(true);
    }
  });
});
