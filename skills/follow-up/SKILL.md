---
name: follow-up
description: Check who opened documents sent with Linkjar (proposals, decks, one-pagers) and draft follow-ups based on what each person read. Use when the user asks "did they open it", "who read my deck/proposal", "who should I follow up with", "any activity on my links", or wants follow-up emails after sending something.
---

# Follow-up

Turn Linkjar activity into a short list of who to contact, why now, and a draft
message for each. Uses the `linkjar` CLI.

## 1. Get the activity

```bash
npx linkjar list --json                               # find the document(s)
npx linkjar activity <link-or-slug> --days 30 --json  # views for one document
```

Each view has `who` (a name when they used a personal link or the email gate,
otherwise "Anonymous"), `when`, `where`, `device`, and on paid plans `time`,
`completion_pct` (how far they got), `engagement` (clicks) and, for web pages,
`sections` (the headings they scrolled to). Without those fields,
say so once and work with opens only.

For a fillable PDF, also check `npx linkjar responses <link> --json`: each response
has `who`, `email`, `when` and `fields` (their answers); signed ones also have
`signed: true`, `signer_name` and `audit` (signed time, location).

## 2. Read it like a seller

- **Signed:** the deal or agreement is done. Suggest the next step (kickoff, invoice,
  onboarding, a thank-you) rather than a sales follow-up. The signed PDF is in
  `npx linkjar responses <link> --save-signed ./signed`.
- **Submitted the form:** the strongest signal short of signing. Reply today, using their answers.

- **Hot:** opened more than once, read most of it, reached Pricing or the ask on
  more than one visit, clicked the button, or a new person viewed it (forwarded internally, often to a
  buyer or finance). Contact today.
- **Warm:** opened once, read part of it. Follow up in a day or two with something
  useful about the part they stopped at.
- **Not opened** after 2-3 days: a short nudge, maybe through another channel.
- Don't over-read one anonymous view; it may be the user checking their own link.

## 3. Draft the follow-ups

For each person worth contacting: one line on what they did, then a 2-4 sentence
email in the user's voice.

- Never say you tracked them ("I saw you read page 4", "I saw you sign"). Use it to choose the topic:
  "Happy to walk through the pricing options if that helps the decision."
- One question or one next step per email.
- A forwarded viewer: suggest the user ask their contact for an introduction.

Present a short list, hottest first:

> **Hank (Globex)**: opened 3 times since yesterday, read 94%, reached Pricing each
> time, clicked "Book a call" but didn't book.
> Draft: "Hi Hank, wanted to make sure you had what you need on pricing. ..."

## 4. Offer next steps

If many readers stalled at the same section, offer to rework it and
`npx linkjar update <link> <file>` (same link). If a new person showed up, offer a
personal link for them: `npx linkjar link <link> --name ... --email ...`.
