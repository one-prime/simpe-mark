# SimpleMark

Edit Markdown with its formatting shown — and none of its syntax hidden.

`# Heading` stays `# Heading`: the `#` is dimmed and the heading is large. `**bold**` keeps
its `**`. The file on disk is exactly what you typed, byte for byte.

## Features

- Headings, emphasis, code, quotes, lists and links styled in place, markers dimmed.
- **Tables**: Tab / Shift-Tab move between cells, Enter adds a row; each re-aligns the
  table. Korean and other wide characters line up.
- **Math**: `$inline$` shows a rendered tooltip, `$$` blocks render below their source
  (MathJax).
- **Images** preview below their line; paths are relative to the document.
- Follows your color theme. Saving, undo/redo and git work as with any text editor.

## Usage

SimpleMark is the default editor for `.md` and `.markdown` files: open one and it opens in
SimpleMark.

- **Open as Text** in the editor title bar (or **Reopen Editor With… → Text Editor**)
  shows the plain text.
- **Open with SimpleMark** in the title bar or the Explorer context menu switches back.

To keep the plain text editor as your default instead, add to your settings:

```json
"workbench.editorAssociations": { "*.md": "default" }
```

## Korean, Chinese and Japanese text in tables

Tables are padded counting each Korean, Chinese or Japanese character as two columns
(Unicode East Asian Width, the same rule Prettier uses), so the saved text is aligned.
SimpleMark draws these characters exactly two columns wide, so its tables line up with any
font.

VS Code's plain text editor relies on its font instead. Unless the font draws these
characters exactly twice as wide as Latin letters, pipes after such text land too far left
there. To see tables aligned in the text editor too, use such a font, for example
[D2Coding](https://github.com/naver/d2codingfont) (Ubuntu: `sudo apt install fonts-naver-d2coding`):

```json
"editor.fontFamily": "'D2Coding', monospace"
```

This setting applies to every file. Noto Sans Mono CJK KR comes close but not exactly: its
Hangul is 1.84 columns wide, so a row with about six Korean characters ends one column short.

> **Warning:** Quit and restart VS Code completely after installing a font. VS Code runs on
> Chromium, which reads the list of installed fonts when it starts; "Reload Window" may not
> be enough. Until then, VS Code silently falls back to another font and the setting seems
> to have no effect.

## Notes

- Images load from the document's folder, the workspace and `https:` URLs only.
- Math supports common TeX packages; commands that create links or HTML (`\href`,
  `\style`) are not available.
