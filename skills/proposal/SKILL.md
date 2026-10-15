---
name: proposal
description: Write a client proposal (scope, timeline, pricing, next steps) as a polished web page and send it as a tracked Linkjar link, with a personal link per decision-maker. Use when the user asks to write, draft, put together or send a proposal, quote, SOW, statement of work or estimate for a client or prospect.
---

# Proposal

Build a proposal as one self-contained HTML page from `template.html` (next to this
file), send it with the `linkjar` CLI, and give the user a link per recipient so they
can see who read pricing and when to follow up.

## 1. Get the facts (ask once, briefly)

You need: client company and contact, what they want (their words), what you'll do,
timeline, price lines and terms, sender name/company/email, a booking link for the
button. Pull what you can from the conversation, files, CRM notes or an earlier
proposal first. Ask only for what's missing, in one message.

Never invent prices, dates, results, client logos or quotes. If something is unknown,
leave a visible `[TBC: ...]` and tell the user.

## 2. Write it

Copy `template.html` and fill every `{{...}}`; delete sections that don't apply.

- **Title = their outcome**, not "Proposal for X" ("Cutting Globex's onboarding time in half").
- **Summary first**: problem, approach, price and timeline in 3-4 sentences. Many
  readers stop here.
- **Use their words** in "What you told us". It shows you listened.
- **Pricing**: a table with a total; options as separate rows (or 2-3 packages side by
  side, recommended one first). Say how long the offer is valid.
- **One next step** and one button (`cta` link). Keep the button text specific.
- **Keep one `<h2>` per section** with plain names (Summary, Pricing, Timeline...).
  Linkjar reports which headings each person scrolled to, so "Hank reached Pricing"
  only works if Pricing is its own heading.
- Set `--brand` to the sender's colour if known. Images: `https://` URLs or `data:`
  URIs only. No external CSS/JS.
- Plain, confident, short. No "we are delighted to present".

Save as e.g. `globex-proposal.html` and open it (or describe it) for the user to check
before sending, unless they've said to just send it.

## 3. Send it

```bash
npx linkjar send globex-proposal.html \
  --for "Hank Scorpio <hank@globex.com>" --for "Priya Shah <priya@globex.com>" \
  --cta-label "Book a call" --cta-url https://cal.com/you/intro
```

One `--for` per decision-maker, so each person's reading shows under their name.
Offer `--password`, `--email-gate --domains globex.com` or `--expires` for sensitive
pricing. If `linkjar` isn't logged in, ask the user to run `npx linkjar login` (never
handle keys in chat). See the `linkjar` skill for all commands.

## 4. Hand over

Give the user each personal link labelled by person, plus a one-line email they can
paste ("Hank, here's the proposal we discussed: <link>"). Tell them to ask you "did
Hank read the proposal?" later; use the `follow-up` skill for that.

To change it after sending: edit the file and `npx linkjar update <link> globex-proposal.html`.
The link stays the same.
