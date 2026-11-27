# Fixes: color fields, Old Outlook line color, button corners (27 Nov 2026)

- **Settings color fields** (social icon background, spacer background, divider line color): the code box, the picker and the recent-color swatches all sat on one row, which squeezed the code box to about 16px so you could not type in it. Now the code box and picker share one full-width row and the swatches wrap on their own row below. Fill fields (social, spacer, background, page) accept `transparent` in any case. It clears the fill, and there is a new "transparent" swatch, the white chip with a red slash. Their empty placeholder reads "transparent".
- **Old Outlook text color:** a line aligned on its own gets an Outlook-only table so Word honors the alignment. That table did not inherit the block's color or font, so after a whole-block color change that line turned black in Old Outlook. The Outlook copy now carries the inherited color, font, size and weight on its cell and `<font>`. Spans with their own color keep it.
- **Button corners:** a button is a table, a cell and a link. With the cell or link selected, radius, fill and border were written to that part only, which left a second shape behind the button. Radius now goes to all three, and fill to the cell and link, whichever part is selected. A button border goes on the link, which the Outlook copy also reads, and is removed from the table and cell.
- Tests: `t_fixes55` (32 checks). Full suite 443/443.

# Salesforce Marketing Cloud template (27 Nov 2026)

`templates/sfmc-template.html` is the Content Builder template for this version. Paste it
in Content Builder > Create > Template > Paste HTML, drop one HTML block into Body Content
and paste EzBuilder's **Copy body** into it. It is kept in this repo and updated with
EzBuilder.

- Kept from the GrapesJS-era template: both tracking tags, the `bodycontent` slot, the
  Content Builder wrapper fixes (`.stylingblock-content-wrapper`, `.camarker-inner`), the
  centered 600px `.email-shell` with its Outlook wrapper, light mode only, and the phone rule
  that shrinks the column to the screen.
- Fixed: the old `img { display:block !important }` turned pictures inside text into their
  own lines; there is no image display rule now. The old
  `table, td { border-collapse:collapse !important }` squared the corners of rounded boxes
  (Icon + text, callouts, buttons); the reset no longer uses `!important`.
- New: on phones, fixed-width boxes (for example a 480px Icon + text) shrink to the screen
  instead of scrolling sideways; `.nl-vbg` Outlook rule as a fallback for VML backgrounds;
  Apple data-detector reset; default font and text color match the editor canvas.
- Removed: duplicated OfficeDocumentSettings/VML blocks, MJML classes (`mj-column-*`,
  `mj-outlook-group-fix`, `mj-full-width-mobile`), campaign styles (`btn-agendar`, `slogan`,
  `force-text`, `bg-light`) and the unused Ubuntu web font.
- Tests: 19 checks render a real Copy body (VML hero, rounded 480px Icon + text, inline image,
  horizontal spacer, social group with 20px spacing, button, divider) inside the template with
  Content Builder's wrapper, at 1280px and 375px.

# Hex colors without "#" (27 Nov 2026)

Like the GrapesJS version, every color field (Font, Background and Border color, page
colors, divider line, horizontal spacer, social plate and button backgrounds) accepts a hex
code typed or pasted without "#".

- `ffffff` and `11223380` get their "#" as soon as the 6 or 8 digits are complete; the caret
  stays where it was. `fff` / `f0a` / `ffff` wait (they may still be on their way to six
  digits) and get the "#" on Enter, Tab or leaving the field. A pasted code is fixed at once.
  Spaces around the code are dropped.
- The color square, the element and the export update together. 8-digit and 4-digit codes
  keep their text, but the email gets the color without transparency (Outlook has none).
- Names (`red`, `white`), `rgb()`, `hsl()` and codes that already have "#" work as before;
  `transparent`, `inherit` and `none` clear the color. Half-typed codes and text that is not a
  color are never written into the email.
- Tests: 22 new checks (typing letter by letter, paste, 3/6/8 digits, names, rgb, Font,
  Background and Border color, divider, button, horizontal spacer, page background, export).

# Image browser upgrade (27 Nov 2026)

The Select Image dialog had no stylesheet rules for its address field or cards, so the
address field kept the browser's default width (about a quarter of its box), and the
preview area had no height, which hid both the picture and its remove button.

- The address field fills its whole box, is focused when the dialog opens, and highlights
  on focus.
- Every card shows a real thumbnail (`<img>`, fitted with `object-fit: contain` on a
  checkerboard so transparent PNGs read clearly), the file name and its pixel size. Images
  that fail to load show "Image unavailable" instead of a broken icon. Images already used
  in the email get an "In email" tag.
- Each card has Preview (eye) and Delete (trash) buttons, shown on hover or keyboard focus.
  Neither picks the image or closes the dialog. Preview shows the picture large with its
  size and address, plus Back, Delete and Use this image.
- Deleting removes the image from the library and is remembered after a reload
  (`ezbuilder-assets-hidden`), including images found in the email. The email itself is
  never changed: a placed image stays where it is. Adding the same address again brings it
  back.
- A filter box appears once the library has 7 or more images.
- Tests: 25 new checks (field width, thumbnails, fallback, preview, delete from the card and
  from the preview, delete of an image in use, persistence across reload, filter).

# EzBuilder standalone v2: studio polish (27 Nov 2026)

Still no GrapesJS, no build step, no network: plain HTML, CSS and JavaScript from file:// or
any web server. Every v1 export guarantee is kept (Outlook tables, VML backgrounds, solid narrow
boxes, valign, horizontal spacers, social spacing, no `src="##"`).

## Direct manipulation on the canvas
- Resize handles: image corner (live px readout, clamped to the column, snaps to full width,
  Shift snaps to 10px, keeps the ratio), spacer height, horizontal spacer width, and the
  border between columns (percent split, snaps to 25/33/50/67/75, never under 10%).
  One drag = one undo step; a click without movement adds none. Width attributes follow
  for Outlook.
- Hover name tag on blocks, a breadcrumb bar under the canvas (`Email › 1/2 Section ›
  Column › Icon + text › Text`) — hover a crumb to outline it, click to select it.
- Drop line is a solid blue line with a label: "Before …", "Into …", "End of email".
- Empty canvas shows how to start (drag, click, or Ctrl+K).

## Faster to drive
- Quick insert / command palette (Ctrl+K or the toolbar): fuzzy search over every block,
  My blocks and commands (undo, redo, copy/paste HTML, preview, Old Outlook, devices, dark
  mode, duplicate, delete, select parent, save block, email check, clear). Arrow keys + Enter.
  Blocks go after the selected block or into the selected column.
- Keyboard shortcuts sheet (`?`), Ctrl/Cmd+D duplicate, Alt+↑/↓ move the block.
- Toasts for save, copy, paste, undo/redo, insert and moves (the status line stays for
  screen readers).

## Email check (preflight)
- Docked, non-modal panel that refreshes as you edit, plus a toolbar badge.
- HTML size meter against Gmail's 102 KB clip (warns at 90 KB); pictures without alt text or
  with file-name alt; data:/SVG/http/placeholder pictures; `#`, javascript:, localhost and
  example.com links (grouped per host); vague link text; missing unsubscribe link; text under
  10px; WCAG contrast (grouped by color pair); placeholder copy; default title; unbalanced
  `{{ }}` merge tags; missing preheader. Click a row to select the element.

## Inspector
- Link toggle for margin and padding (one value on all four sides), on by default when the
  sides already match.
- Color swatches: the colors already used in the email, one click to apply.

## Paste hardening
- Quoted semicolons and braces survive: `content:"a;b{}"` in a style block and
  `font-family:'A;B'` in a style attribute (both used to be split apart).
- Covered by tests: nested MSO conditionals with VML, :hover / @media / CSS variables /
  comments, tables without tbody, inline SVG, broken tags, BOM / CRLF / tabs / accents.

## Reliability and speed
- Saves are debounced (300 ms) and flushed on page hide; a full browser storage shows one
  clear warning and a note when saving works again, never an error.
- Undo history capped at 80 steps; typing in a field is one step.
- Email check and badge run when the browser is idle.
- Measured in Chromium on a 40-block email: export < 400 ms, check < 300 ms, undo/redo
  < 60 ms, style repaint < 16 ms (all asserted by the tests).
- Layout checked at 1280, 1440 and 1920 px; no overflow or overlap; works over http too.

## Tests
`python test/test_standalone.py [ROOT] [SHOT_DIR]` — 345 checks with real mouse drags and
keyboard, 0 console or page errors required.

## Known limits
- Checked in Chromium only; real Outlook, Gmail and Apple Mail still need a test send.
- The first export of some pasted emails tidies their wrapper once (a divider with margins
  gets the 600px Outlook wrapper); every later round trip is byte-identical.

# EzBuilder standalone: review fixes (27 Nov 2026)

No GrapesJS. Plain HTML, CSS and JavaScript; works offline from file:// or any web server.
Checked against EzBuilder1911c (the GrapesJS version) block by block, field by field, and by
pasting real emails from it.

## Fixed
- Clicking a link or button in the canvas opened the linked page inside the editor and
  replaced the email. Links never navigate now, in the canvas or in the Old Outlook pane.
- Preview had no way back (every button was hidden). It now shows an exit button and Esc
  leaves it; blocks can't be selected, edited or dropped on while previewing.
- Pasted `<style>` rules were not written onto the elements in the export (GrapesJS did this),
  so pasted buttons lost their color in Gmail/Outlook. They are now inlined by specificity;
  @media and other rules stay in a style block, and values keep their written form (#e11d48,
  not rgb()).
- A no-break space in a thin color cell or spacer was dropped on paste, which can collapse it
  in Outlook. Kept now.
- Clicking a paragraph in a pasted email selected the whole cell. Text boxes are selected
  directly again; social icons, buttons and images pick the right element.
- Drops could land inside a table row, a button, a social icon or a spacer cell. Not any more.
- New sections exported their "drop blocks here" starter text into the email. Sections are
  empty 150px columns, like the GrapesJS version (1/3 columns are 33.3333%).
- Icon + text used an SVG icon, which Gmail and Outlook don't show. It uses the original PNG.
- Text block, Hero and Testimonial now match the GrapesJS markup.
- The inline image field added a picture on every key press. It applies on Enter now.
- The Layers eye wrote display:none into the exported email. It hides in the editor only.
- Aligning a table or picture left/right could make the next block float beside it
  (float:none is written, as GrapesJS did).

## Added back (were in the GrapesJS version)
- Toolbar: Fullscreen, Copy HTML, Paste HTML, Toggle images (never writes src="##" into the
  export or the saved project), with tooltips.
- Rich text toolbar on double-click: bold, italic, underline, strikethrough, link, and an image
  at the cursor. Inline images keep their shape when resized and have Link and Baseline align.
- Double-click a picture to open the image library; the Image block opens it on drop.
- Vertical align for sections and columns; Id and Title on blocks.
- Divider settings work on dividers pasted from the GrapesJS version too.
- Layers can be dragged to reorder.
- Keyboard: Ctrl+C / Ctrl+V for blocks, w/s/a/d to move the selection, Esc.

## Tests
- `test/test_standalone.py` (Playwright, Chromium): real clicks, drags and typing; fails on
  any console or page error. Run: `python test/test_standalone.py <folder with index.html>`.
- `test/check.js` (Edge harness) now finds index.html next to it instead of E:\EzBuilder\...,
  and expects empty sections and the original Text block.
