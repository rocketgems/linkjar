---
name: pitch-deck
description: Build an investor pitch deck as a web page (slides that work on phones) and send it to investors as tracked Linkjar links, one per investor, to see who read it, how far they got and who forwarded it. Use when the user asks for a pitch deck, investor deck, fundraising deck or seed/Series A deck, or wants to send their deck to investors.
---

# Pitch deck

Build the deck from `template.html` (next to this file): slides that snap as you
scroll, work on a phone, page with arrow keys and print to PDF. Send one link per
investor with the `linkjar` CLI.

## 1. Get the facts

Company, one-line pitch, problem, solution, traction (real numbers and dates), market,
business model, competition, team, the ask and use of funds, founder contact. Use what
the user has already (an old deck, a memo, a website); ask once for what's missing.
If they already have a deck as a PDF, skip building and just send that file (step 3).

Never invent metrics, logos, investors or quotes. Mark gaps `[TBC: ...]`.

## 2. Build it

Copy `template.html`, fill the slides, delete or add `<section class="slide">` blocks.

- 10-12 slides. Standard order: cover, problem, solution, (product), traction, market,
  business model, competition, team, the ask. Lead with traction if it's strong.
- **One idea per slide; the `<h2>` states it as a claim** ("Revenue tripled in 6 months",
  not "Traction"). Linkjar reports which slides each investor reached, so each slide
  needs its own heading.
- Big numbers with `.big`, simple charts with `.bars` (heights as % of max) or an
  inline SVG. Images: `https://` URLs or `data:` URIs only.
- Short text: a slide is read in seconds. Put detail in an optional appendix slide.
- Set `--brand` to the company colour.

## 3. Send it

```bash
npx linkjar send deck.html --title "Acme seed deck" \
  --for "Jane Doe <jane@fund.vc>" --for "Raj <raj@angels.co>"
```

One `--for` per investor; forwarded copies show up as new viewers on that person's
link. Suggest `--email-gate` (Pro) for a link they'll forward around, and `--expires`
once the round closes. For data-room material (financials, cap table), suggest a room:
`npx linkjar room "Acme seed data room" deck financials cap-table --email-gate`.

## 4. Hand over

List each investor's link by name. Later, "who read my deck?" runs
`npx linkjar activity <link> --json`; use the `follow-up` skill to turn it into
follow-ups (who to email first and about which slide).
