# Capsule paste results

What actually happens when a sealed atom is pasted into each platform's editor. The Medium and
Substack converter rules (`lib/capsule/converters/`) follow these results; re-run the checks every
few months, because the platforms change their editors.

## How to run a check

1. In the newsletter tool, open a draft and paste the body of `tests/fixtures/capsule-fixture.md`.
2. Add a title, subtitle, tags and an original link, then open **Cross-post**.
3. Choose **Publish on Medium** (or Substack). The post is copied and the editor opens in a new tab.
4. Paste with Cmd/Ctrl+V into the story body. Do not press Publish; leave it as a draft.
5. Fill in the table below. Note the date, browser and version.

## Chrome and Edge (Ananya)

Date: ____ · Chrome ____ · Edge ____

| Check | Medium | Substack |
|---|---|---|
| New-post address opens a blank post when signed in | | |
| Copy, then the new tab opens (no pop-up block) | | |
| `<h1>` title becomes the story title | | n/a (separate field) |
| `<h2>` subtitle becomes the subtitle (or a heading?) | | n/a (separate field) |
| `h3` / `h4` arrive as large / small headings | | |
| Bold, italic, strike, inline code | | |
| Links (including `?a=1&b=2` addresses) | | |
| Bullet and numbered lists | | |
| Quote | | |
| Images from the newsletter bucket | | |
| Code block, and whether the language is kept | | |
| Table-as-list rows | | |
| Footnote numbers and Notes list | | |
| Math left as plain text | | |
| Bare YouTube link: embed or plain link? | | |
| Horizontal rule | | |
| Where the canonical (original) link is set | Story ••• → More settings → Customize canonical link | |

## Firefox and Safari (Mridul)

Same table, same fixture.

## Changes made because of these results

- _None yet._
