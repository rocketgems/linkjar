---
name: case-study
description: Turn a customer success story (call notes, a testimonial, metrics) into a case study web page and send it as a tracked Linkjar link. Use when the user asks for a case study, customer story, success story or proof to send a prospect.
---

# Case study

Build from `template.html` (next to this file): headline result, challenge, solution,
results, the customer's own words, and a call to action. Send with the `linkjar` CLI.

## 1. Get the facts

Customer name (or "a 200-person logistics company" if they can't be named), the
situation before, what they did, results with before/after numbers and timeframe, a
real quote with name and title. Work from transcripts, emails or notes the user gives you.

Only use quotes and numbers that are in the source material. Don't round 38% up to
"almost half" or improve a quote. Ask the user to confirm the customer approved
publishing their name and logo.

## 2. Write it

- Headline: "How <Customer> <result> with <Product>". Put the top three numbers in
  the callout under it.
- Challenge and solution: short and concrete, in the customer's terms.
- Results as before → after.
- Keep the `<h2>` per section (Linkjar reports which sections were read).

## 3. Send

```bash
npx linkjar send globex-case-study.html --title "Globex case study"
```

When it's for a specific deal, add `--for "Name <email>"`, or put it in a deal room
with the proposal: `npx linkjar room "Initech deal" proposal-link case-study-link`.
