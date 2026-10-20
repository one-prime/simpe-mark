import { describe, expect, it } from 'vitest';
import { cachedMath, renderMath } from '../src/index';

describe('renderMath', () => {
  it('renders inline math as one self-contained SVG', async () => {
    const { svg } = await renderMath('E = mc^2', false);
    expect(svg?.match(/<svg/g)).toHaveLength(1);
    expect(svg).toMatch(/^<svg[^>]* width="[\d.]+ex"/);
    expect(svg).not.toMatch(/<use|xlink:href|<script|<a /);
  });

  it('renders display math', async () => {
    const { svg } = await renderMath('\\sum_{i=1}^{n} x_i^2 = \\frac{n(n+1)(2n+1)}{6}', true);
    expect(svg).toContain('data-latex');
  });

  it('loads font parts on demand', async () => {
    const { svg, error } = await renderMath('\\mathbb{R} \\mathfrak{g}', false);
    expect(error).toBeUndefined();
    expect(svg).toContain('<path');
  });

  it('reports TeX errors as text', async () => {
    expect(await renderMath('\\frac{1}{', false)).toEqual({ error: 'Missing close brace' });
    expect(await renderMath('\\undefinedmacro', false)).toEqual({ error: 'Undefined control sequence \\undefinedmacro' });
  });

  it('refuses commands that produce links or HTML', async () => {
    expect((await renderMath('\\href{javascript:alert(1)}{x}', false)).error).toMatch(/Undefined control sequence/);
    expect((await renderMath('\\style{color:red}{x}', false)).error).toMatch(/Undefined control sequence/);
  });

  it('caches results', async () => {
    expect(cachedMath('a+b', false)).toBeUndefined();
    const first = await renderMath('a+b', false);
    expect(cachedMath('a+b', false)).toBe(first);
  });
});
