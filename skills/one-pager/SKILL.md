---
name: one-pager
description: Write a one-page product or sales sheet (sell sheet, product overview, leave-behind, brochure page) as a web page and send it as a tracked Linkjar link. Use when the user asks for a one-pager, sell sheet, product sheet, leave-behind, overview doc or "something short I can send after the call".
---

# One-pager

A one-pager is read in under a minute: one outcome, how it works, proof, one action.
Build it from `template.html` (next to this file) and send it with the `linkjar` CLI.

## 1. Get the facts

Product, who it's for, the outcome, 2-4 capabilities, one or two proof points (real
metrics, customers the user can name), pricing if public, the call to action link.
Use the website, existing docs or the conversation first; ask once for the rest.
Never invent customers, metrics or quotes; mark gaps `[TBC: ...]`.

## 2. Write it

Fill `template.html` and delete what doesn't apply.

- Headline = the reader's outcome. Sub = who it's for and what it replaces.
- 3 short sections at most besides the header; each with its own `<h2>` so Linkjar can
  report which ones were read.
- Tailor it when it's for one account: their name in the eyebrow, their use case in
  "How it works", the proof point closest to their industry.
- Images by `https://` URL or `data:` URI; no external CSS/JS. Set `--brand`.

## 3. Send and hand over

```bash
npx linkjar send acme-one-pager.html --for "Sam Lee <sam@acme.com>" \
  --cta-label "Book a demo" --cta-url https://cal.com/you/demo
```

Give the user the link (per person if named) and a one-line note to paste. A one-pager
used for many prospects: send once without `--for`, then make personal links as needed
with `npx linkjar link <link> --name ... --email ...`.
