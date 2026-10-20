# SimpleMark

Markdown that **never hides its syntax**. Markers like `#`, `**` and `_` stay
visible but dimmed; the text they wrap gets the style.

## Inline styles

Some **bold**, some _emphasis_, ***both***, ~~struck~~ and `inline code`.
A [link](https://example.com "title"), an autolink <https://example.com>, a bare
www.example.com, and an escaped \*star\*.
Ctrl+Click (⌘+Click on a Mac) a link to open it, e.g. [the math section](#math).

Setext heading
--------------

> A quote with **bold** inside.
> 한국어도 잘 보여야 합니다.

- [ ] a task
- [x] a done task
- a bullet
  1. nested ordered

```ts
const answer = 42; // code blocks keep their fences
```

| Name  | Age | City  |
|-------|----:|-------|
| Alice |  30 | Seoul |
| 지민  |   4 | Busan |

## Images

![A sunset](./images/sunset.png "Sample PNG")

A reference-style image ![logo][logo] in a sentence.

[logo]: ./images/logo.svg

A missing one: ![gone](./images/missing.png)

## Math

Inline math like $E = mc^2$ and $a_i * b_i * c_i$ sits in the text
(put the cursor inside it). Prices like $5 and $10 stay text.

$$
\sum_{i=1}^{n} x_i^2 = \frac{n(n+1)(2n+1)}{6}
$$

$$ \mathbb{R}^n \to \mathfrak{g} $$

$$
\frac{1}{
$$

## Links

Ctrl+Click (⌘+Click on a Mac) each link; click an image preview to open the image.

- A web page: [VS Code docs](https://code.visualstudio.com/docs) — your browser (VS Code asks first)
- Another document: [the other note](other.md) — opens in SimpleMark
- A heading in this document: [jump to Math](#math)
- An image file: [the sunset image](./images/sunset.png) — VS Code's image viewer
- A script link: [do not run](javascript:alert(1)) — refused, nothing happens

Paths starting with `/`: an absolute path on disk if that file exists, else from the
workspace folder. The first image only exists on this machine; the second needs the
SimpleMark repository open as the VS Code workspace. (The browser demo reads both from
disk through its dev server.)

![Absolute path](/home/jin/Downloads/Sandbox/simple-mark/packages/codemirror/demo/images/sunset.png)

![From the workspace folder](/packages/codemirror/demo/images/logo.svg)

---

The end.
