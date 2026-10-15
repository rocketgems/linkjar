# linkjar

Send decks, proposals, PDFs and HTML pages as branded, tracked links from your
terminal or your AI agent, then see who opened them, how far they read and what they
clicked.

```bash
npx linkjar login
npx linkjar send deck.pdf --for "Sam Lee <sam@acme.com>"
npx linkjar activity deck
```

Requires Node 18+. No dependencies. Install globally with `npm i -g linkjar`, or run
it with `npx linkjar`.

## Log in

```bash
linkjar login                 # opens your browser; the token is saved, never printed
linkjar login --no-browser    # over SSH: open the printed link on any device
linkjar login --key lj_...    # or save an API key
```

In CI or agent sandboxes, set `LINKJAR_API_KEY` instead. Create keys at
**Settings → Claude, CLI & API** on linkjar.com. The env var takes precedence over a saved
login. The login is saved in `~/.config/linkjar/config.json` (or under
`$XDG_CONFIG_HOME`), readable only by you. `linkjar logout` removes it.

## Commands

| Command | What it does |
| --- | --- |
| `send <path\|->` | Publish a PDF, Office file, HTML file, folder with `index.html`, or HTML on stdin |
| `update <ref> <path\|->` | Replace what a link shows; the link stays the same |
| `list` | Recent documents with view counts |
| `activity <ref>` | Who opened it, when, how far they read (alias `views`) |
| `responses <ref>` | What people submitted or signed on a fillable PDF (`--csv` for a spreadsheet, `--save-signed <dir>` for signed PDFs) |
| `link <ref> --name --email` | A personal link for one person |
| `settings <ref>` | Password, email gate, allowed domains, expiry, call-to-action button |
| `room <title> <ref...>` | Several documents behind one link |
| `open <ref>` | Open the document's settings page |
| `whoami`, `login`, `logout` | Account |

`<ref>` is a link, its slug or its id. Every command has `--help` with examples.
Add `--json` to any command for the raw API response. In normal output the first
line is the link.

```bash
linkjar send ./proposal-site --title "Acme proposal" --password hunter22
linkjar send deck.pdf --email-gate --domains acme.com --expires 2026-12-31
linkjar send deck.pdf --cta-label "Book a call" --cta-url https://cal.com/me/intro
cat page.html | linkjar send - --title "One-pager"
linkjar settings acme-proposal --remove-password
linkjar room "Acme deal room" acme-proposal case-study --email-gate
```

Use `--url` or `LINKJAR_URL` to point the CLI at another server, for example a local
dev server.

## For AI agents

`skills/` holds agent skills for Claude Code, OpenClaw and similar agents:

| Skill | What it does |
| --- | --- |
| `linkjar` | Every CLI command: send, personal links, settings, activity, rooms |
| `proposal` | Writes a client proposal page from a template and sends a link per decision-maker |
| `pitch-deck` | Builds a phone-friendly slide deck and sends a link per investor |
| `one-pager` | A sell sheet / leave-behind, optionally tailored to one account |
| `case-study` | Turns call notes and metrics into a case study (real quotes and numbers only) |
| `follow-up` | Reads activity and drafts who-to-contact-next emails |

The writing skills ship a `template.html` with one `<h2>` per section, because the
viewer reports which headings each person scrolled to. Ways to install them:

- **Claude Code plugin:** this folder is also a Claude Code plugin and marketplace
  (`.claude-plugin/`). Publish it as the root of a **public GitHub repository**,
  because the marketplace only works from a public repo. Users then run:
  ```
  /plugin marketplace add <github-owner>/<repo>
  /plugin install linkjar@linkjar
  ```
- **Any agent:** copy the folders under `skills/` into the agent's skills folder, for
  example `~/.claude/skills/`.

For agents that can't run a CLI, such as Claude.ai or ChatGPT on the web, use the
remote connector at `https://linkjar.com/mcp` instead.

## Development

```bash
npm test     # node --test: arg parsing, zip writer, fake-server send/activity/refresh, OAuth flow
LINKJAR_URL=http://localhost:8000 node bin/linkjar.js login
```
