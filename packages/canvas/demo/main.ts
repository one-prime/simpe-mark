import { createEditor } from '@simple-mark/codemirror';
import { defaultTheme } from '@simple-mark/model';
import { createMathImages, layoutMarkdown, paintMarkdown, type Size } from '../src/index';

const sample = `# SimpleMark on a canvas

Markdown that **never hides its syntax**, drawn with _Canvas 2D_: \`code\`, ~~struck~~,
a [link](https://example.com) and inline math $E = mc^2$.

## Lists and quotes

- [ ] a task
- a bullet with a long line that wraps on a narrow canvas to show how wrapping behaves here
> A quote with **bold** inside.
> 한국어 문장도 줄바꿈이 됩니다. 아주 긴 한국어 문장은 글자 사이에서도 줄을 바꿀 수 있습니다.

| Name  | Age | City  |
|-------|----:|-------|
| Alice |  30 | Seoul |
| 지민  |   4 | Busan |

\`\`\`ts
const answer = 42;
\`\`\`

![A sunset](./sunset.png "Sample PNG")

$$
\\sum_{i=1}^{n} x_i^2 = \\frac{n(n+1)(2n+1)}{6}
$$

---

The end.
`;

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const pane = document.getElementById('canvas-pane')!;
const ctx = canvas.getContext('2d')!;
const measureCtx = document.createElement('canvas').getContext('2d')!;
const measure = (text: string, font: string) => {
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
};

// Images by path, drawn once loaded.
const images = new Map<string, HTMLImageElement | null>();
const image = (src: string) => {
  if (!images.has(src)) {
    const img = new Image();
    images.set(src, img);
    img.onload = () => draw();
    img.onerror = () => {
      images.set(src, null);
      draw();
    };
    img.src = src;
  }
  return images.get(src);
};
const imageSize = (src: string): Size | null | undefined => {
  const img = image(src);
  return img === null ? null : img && img.complete && img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : undefined;
};
const math = createMathImages(() => draw());

let text = sample;
function draw(): void {
  const width = pane.clientWidth - 40;
  const style = { fontFamily: defaultTheme.fontFamily, fontSize: 15, fontWeight: 400, lineHeight: 1.6, color: defaultTheme.color };
  const layout = layoutMarkdown(text, { width, style, measure, imageSize, mathSize: (tex, family) => math.size(tex, family) });
  const dpr = devicePixelRatio;
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(layout.height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${layout.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  Object.assign(window, { layout });
  paintMarkdown(ctx, layout, { image: (src) => image(src) ?? null, math: (tex, color) => math.image(tex, color) }, style.color);
}

const view = createEditor(document.getElementById('editor')!, {
  doc: sample,
  onChange: (next) => {
    text = next;
    draw();
  },
});
Object.assign(window, { view, draw });
new ResizeObserver(() => draw()).observe(pane);
draw();
