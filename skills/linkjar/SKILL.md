---
name: linkjar
description: Send decks, proposals, one-pagers, PDFs and HTML pages you made as branded, tracked Linkjar links, and check who opened them. Use when the user asks to send, share, publish or host something "as a link" or "with Linkjar", to make a link for a specific person, to password-protect or gate a shared document, or asks "did they open it / who read the proposal / how far did they get".
---

# Linkjar

Linkjar turns a file or page into a branded link and tells the sender who opened it,
how far they read and what they clicked. Use the `linkjar` CLI (via `npx linkjar` if
it isn't installed).

## Setup (once)

- Check: `npx linkjar whoami`. If it says "Not logged in", ask the user to run
  `npx linkjar login` themselves (it opens a browser; over SSH add `--no-browser`).
- Headless/CI: the user sets `LINKJAR_API_KEY` (Settings → Claude, CLI & API on linkjar.com).
- Never ask the user to paste a key or token into the chat, and never print one.

## What can be sent

- PDFs, Word, PowerPoint, Excel (Office files convert to PDF in a minute or two).
- One HTML file, or a folder with `index.html` at its top (sent as a small website).
- HTML must be self-contained: CSS and JS inline or in the folder; images as
  `https://` URLs, `data:` URIs, or files inside the folder. Never point at files
  outside it (`../logo.png`, `/Users/...`) or at root paths (`/img/a.png`).
- If you generated the page, write it to a file first, or pipe it: `... | npx linkjar send -`.

## Workflows

Publish, with a personal link per recipient (their views show under their name):

```bash
npx linkjar send proposal.html --title "Acme proposal" \
  --for "Sam Lee <sam@acme.com>" --for "priya@acme.com"
```

The first line of output is the link; the next lines are `Name: personal link`.
Warnings (missing images, safety review, Office conversion) go to stderr: read them
and fix or report them.

Lock it down (any combination, at send time or later):

```bash
npx linkjar send deck.pdf --password hunter22 --email-gate --domains acme.com --expires 2026-12-31
npx linkjar settings acme-proposal --remove-password --no-email-gate
npx linkjar send deck.pdf --cta-label "Book a call" --cta-url https://cal.com/me/intro
```

`--email-gate` and rooms need Pro; expiry needs a paid plan. Personal links are free. If the API
says a feature needs an upgrade, tell the user rather than retrying.

Change what a link shows, keeping the same link (people who have it see the new version):

```bash
npx linkjar update acme-proposal proposal-v2.html
```

Who opened it:

```bash
npx linkjar activity acme-proposal --days 30 --json
```

Summarize for the user as a follow-up suggestion, not a raw dump, e.g. "Sam opened it
twice yesterday, read 94% and spent longest on pricing; Priya hasn't opened it yet.
Good moment to follow up with Sam about pricing." No views yet is useful news too.

Fillable PDFs (order forms, applications, agreements): visitors fill in the form in
the viewer and press Submit. If the PDF has signature fields, they sign there (draw or
type, after agreeing to sign electronically); both sides get a signed PDF with a
signature certificate (time, IP, location, device, consent). Read what they sent with:

```bash
npx linkjar responses order-form --json          # or --csv > responses.csv
npx linkjar responses agreement --save-signed ./signed   # download signed PDFs
```

A signed response means it's agreed: tell the user who signed and when, and suggest
the next step. This is a simple electronic signature with an audit trail, not a
certificate-based (Adobe "verified") signature.

Find documents: `npx linkjar list --query acme --json`.

Several documents behind one link (deal room, Pro):

```bash
npx linkjar room "Acme deal room" acme-proposal case-study security-faq --email-gate
```

A personal link later: `npx linkjar link acme-proposal --name "Sam Lee" --email sam@acme.com`.

## Related skills

To write the document itself, use `proposal`, `pitch-deck`, `one-pager` or
`case-study`. To turn activity into follow-ups, use `follow-up`.

## Notes

- `<ref>` is the link, its slug or its id; pass the link if unsure.
- Use `--json` whenever you parse output. Every command has `--help` with examples.
- Pages are scanned for safety; a held page shows "not available" until reviewed
  (usually within a day). Tell the user if that happens.
- Always give the user the link (and each personal link, labelled by person) at the
  end. Mention that they'll see who opened it with `linkjar activity` or in the dashboard.
