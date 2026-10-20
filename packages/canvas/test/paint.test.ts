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
      // A monospace font with other metrics, like inline code in a real font.
      const mono = this.font.includes('monospace');
      return { width: text.length * 10, fontBoundingBoxAscent: top ? 0.1 : mono ? 12 : 16, fontBoundingBoxDescent: top ? 20 : mono ? 8 : 4 };
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

  it('puts inline code on the baseline of the line, like a browser', () => {
    const layout = layoutMarkdown('the `key` is', {
      width: 400,
      style: { fontFamily: 'sans-serif', fontSize: 20, fontWeight: 400, lineHeight: 1.5, color: '#000' },
      measure: (text) => text.length * 10,
    });
    const { ctx, drawn } = recordingCanvas('alphabetic');
    paintMarkdown(ctx, layout);
    expect(drawn.map((d) => d.text)).toEqual(['the ', '`', 'key', '`', ' is']);
    // Line 30 high, sans-serif 16 + 4: the baseline 5 + 16 from the top, for every run.
    expect(drawn.map((d) => d.y)).toEqual([21, 21, 21, 21, 21]);
  });

  it('draws one rounded box behind inline code and its backticks', () => {
    const layout = layoutMarkdown('the `key` is', {
      width: 400,
      style: { fontFamily: 'sans-serif', fontSize: 20, fontWeight: 400, lineHeight: 1.5, color: '#000' },
      measure: (text) => text.length * 10,
    });
    const boxes: { x: number; width: number; radii: number[] }[] = [];
    const { ctx } = recordingCanvas('alphabetic');
    Object.assign(ctx, {
      beginPath() {},
      fill() {},
      roundRect(x: number, _y: number, width: number, _height: number, radii: number[]) {
        boxes.push({ x, width, radii });
      },
    });
    paintMarkdown(ctx, layout);
    expect(boxes).toEqual([{ x: 40, width: 50, radii: [7.5, 7.5, 7.5, 7.5] }]);
  });
});
