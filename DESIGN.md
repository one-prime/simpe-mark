# SimpleMark — Design Notes

A WYSIWYG Markdown editor that **never hides Markdown syntax**. Formatting is a
visual layer over the raw text; the file on disk is exactly what you typed.

## Principles

1. **The Markdown text is the document.** The editor stores raw Markdown
   characters. Saving = writing the text. No Markdown→model→Markdown conversion.
2. **Nothing is ever hidden.** `#`, `**`, `` ` ``, `|`, `![](…)`, `$…$` all stay
   visible. Syntax markers are dimmed; the content they wrap is styled.
3. **Lossless round-trip.** Opening and saving an unedited file produces a
   byte-identical file (whitespace, `*` vs `_`, line endings, trailing newline).
4. **Rendered output is preview only.** Image and math renders are widgets that
   are not part of the document and never written to disk.

## Architecture

```
.md file ──load──▶ text ──Lezer (incremental)──▶ syntax tree ──model──▶ styled runs/blocks
                    ▲                                                     │
                    │ edits                                ┌──────────────┴──────────────┐
                 user input                          CM6 decorations              Canvas 2D drawing
                                                    (editor, VS Code)               (DrawLayout)
```

- **Editor engine:** CodeMirror 6.
- **Parser:** Lezer (`@lezer/markdown` with GFM) plus a small math extension.
- **Styling model:** one pure function from text to styled runs/blocks, shared
  by the CM6 editor and DrawLayout's canvas renderer so they never disagree.
- **Undo/redo:** in-memory editor history. Not written to the `.md` file.
  (Persisting history across restarts is optional, later, in app storage.)

## Markdown flavor

GFM (tables, task lists, strikethrough, autolinks) + math (`$…$`, `$$…$$`).

## Element display rules

| Element | Display |
|---|---|
| Headings, emphasis, code, quotes, lists, links | Markers dimmed, content styled |
| Tables | Raw pipe text, styled as a grid (see below) |
| Images | Source visible; rendered image widget below the line |
| Block math `$$…$$` | Source visible; rendered math below the block |
| Inline math `$…$` | Source visible; rendered math in a tooltip on hover / cursor inside |

### Tables

- Monospace font inside table blocks so pipes line up.
- Header row bold, delimiter row dimmed, body rows with alternating background.
- Auto-align (Advanced Tables style) on **Tab / Enter**, not every keystroke:
  Tab → next cell + re-pad column, Enter → new row. Padding respects column
  alignment (`:--`, `--:`, `:-:`).
- Padding uses **display width**, not string length — CJK characters count as 2
  columns.

### Math

- **MathJax with SVG output**: self-contained SVG (no fonts to load), so the same
  render works in the CM6 widget, on DrawLayout's canvas, and in its CLI render.
- On parse error, show the source marked with an error style instead of a broken
  widget.

## Known pitfalls

- Context-sensitive constructs (setext headings, lazy continuation) mean an edit
  can change how neighboring blocks parse.
- Line wrapping in CM6 (browser) vs DrawLayout's canvas (`wrapText`) can differ
  slightly; keep fonts and line height identical.

## Packages and hosts

```
packages/
  model/       pure TS, no DOM: Lezer parse (GFM + math) → styled runs/blocks,
               table auto-align. Shared by every renderer.
  codemirror/  CM6 editor + extensions, built on model
               createEditor(parent, { doc, onChange, resolveImage, theme, readOnly })
  vscode/      VS Code extension hosting the editor in a webview
(DrawLayout)   draws model output with Canvas 2D; mounts the CM6 editor to edit
```

### VS Code

- `CustomTextEditorProvider` + webview running the editor.
- VS Code `TextDocument` is the source of truth; webview edits → `WorkspaceEdit`,
  external changes → pushed to webview.
- VS Code owns undo/redo (CM6 history disabled in this host).
- Images resolved via `webview.asWebviewUri()`; theme from `--vscode-*` CSS vars.

### DrawLayout (Markdown text)

DrawLayout (`../DrawLayout`) renders with **Canvas 2D**; text is edited in a
`<textarea>` overlay (`CanvasTextEditor.tsx`). `drawlayout render` (CLI) and the
PNG copy use the same renderer, so Markdown must be drawn on the canvas — a DOM
overlay layer would be missing from both and break z-order.

- **Display:** Canvas 2D draws `model` output. Because syntax is never hidden,
  this is only styled text runs (font, size, weight, color), line backgrounds
  (code blocks, tables), and image/math bitmaps — no HTML layout engine needed.
  Tables are monospace text, so they draw as plain lines.
- **Editing own text:** the CM6 editor replaces the textarea for Markdown text,
  using the same overlay transform and the same draft → commit/cancel lifecycle
  (one DrawLayout undo step per edit session; CM6 history inside the session).
- **File-backed text (`file: "notes/x.md"`) stays read-only on the canvas**, as
  all file-backed text is today. Edit the `.md` file in VS Code with SimpleMark.

- **Data model:** Markdown is the existing `TEXT` node plus an optional
  `textFormat: "plain" | "markdown"` property — not a new node type, so every
  `TEXT` feature (fonts, auto-size, `file`/`key`, overrides) keeps working and
  readers that don't know Markdown still show the text. Rule: `textFormat` set →
  use it; otherwise a `file` ending in `.md`/`.markdown` → markdown; otherwise
  plain.

## Milestones

1. ✅ `model` (parse → block ranges + flat styled spans, theme, look resolution)
   and `codemirror` (decorations, line-ending preservation) with a demo page
   (`npm run dev` → http://localhost:5180).
2. Tables: Tab/Enter auto-align with display-width padding; alternating rows.
3. Images and math: preview widgets below the source, inline math tooltip
   (MathJax SVG).
4. VS Code extension.
5. DrawLayout: `textFormat`, canvas drawing of `model` output, CM6 editing overlay.

## Findings

- CodeMirror joins lines with `\n` in `doc.toString()` even with a `\r\n`
  separator; always read text back with `state.sliceDoc()`.
- Monospace tables with Korean only line up when one font draws both Latin and
  Hangul at a 1:2 width (D2Coding, Noto Sans Mono CJK KR); a Latin-only font
  plus a CJK fallback does not. The theme lists those fonts first. On machines
  without them, tables misalign — milestone 2 must handle this (e.g. sizing cells
  by measured width instead of trusting the font).
