import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { Client } from './api.js';
import { parseArgs, parsePerson, parseRef, UsageError } from './args.js';
import { oauthLogin } from './auth.js';
import { baseUrl, configPath, deleteConfig, loadConfig, saveConfig } from './config.js';
import { openBrowser, readStdin } from './util.js';
import { unzipEntries, zipDirectory } from './zip.js';

export const VERSION = '0.1.0';

const GLOBAL = { json: 'boolean', url: 'string', help: 'boolean', version: 'boolean' };
const ALIASES = { h: 'help', v: 'version' };
const LINK_SETTINGS = {
  password: 'string', 'email-gate': 'boolean', domains: 'string', expires: 'string',
  'cta-label': 'string', 'cta-url': 'string',
};

const SETTINGS_HELP = `
  --password <pw>         Visitors need this password to open it
  --email-gate            Ask visitors for their email first (Pro)
  --domains <a.com,b.com> Only allow emails at these company domains
  --expires <YYYY-MM-DD>  Link stops working after this date (paid plans)
  --cta-label <text>      Call-to-action button text, e.g. "Book a call"
  --cta-url <url>         Where the button goes`;

const MAIN_HELP = `linkjar ${VERSION}: send decks, proposals, PDFs and HTML pages as branded,
tracked links, and see who opened them.

Usage: linkjar <command> [options]

Commands:
  login              Log in through the browser (or --key <api key>)
  logout             Forget the saved login
  whoami             Show the account and workspace in use
  send <path|->      Publish a PDF, Office file, HTML file, folder (with index.html) or stdin HTML
  update <ref> <path|->  Replace what a link shows; the link stays the same
  list               Your recent documents with view counts
  activity <ref>     Who opened it, when, how far they read (alias: views)
  responses <ref>    What people submitted on a fillable PDF (--csv for a spreadsheet)
  link <ref>         A personal link for one person (--name, --email)
  settings <ref>     Password, email gate, allowed domains, expiry, button
  room <title> <ref...>  Several documents behind one link
  open <ref>         Open the document's settings page in the browser
  skills [install]   List agent skills, or install them for Claude Code

<ref> is a link, its slug (the part after the domain) or its id.

Global options:
  --json             Print the raw JSON response (for scripts and agents)
  --url <url>        Server (default https://linkjar.com, or LINKJAR_URL)
  -h, --help         Help for a command: linkjar send --help
  -v, --version

Auth: \`linkjar login\` stores a token in ${'~/.config/linkjar/config.json'}.
In CI or agents, set LINKJAR_API_KEY instead (Settings → Claude, CLI & API).

Examples:
  linkjar send deck.pdf --for "Sam Lee <sam@acme.com>"
  linkjar send ./proposal-site --title "Acme proposal" --password hunter22
  linkjar activity acme-proposal
`;

const COMMANDS = {
  login: {
    flags: { key: 'string', 'no-browser': 'boolean' },
    help: `Usage: linkjar login [--key <api key>] [--no-browser]

Logs in through your browser (OAuth). The token is saved to the config file
with owner-only permissions and is never printed.

  --key <key>     Save an API key (starts with lj_) instead of logging in
  --no-browser    Don't try to open a browser; just print the login link

Examples:
  linkjar login
  linkjar login --no-browser       # over SSH: open the printed link anywhere
  LINKJAR_API_KEY=lj_... linkjar whoami   # no login needed with the env var`,
    run: login,
  },
  logout: { flags: {}, help: 'Usage: linkjar logout\n\nDeletes the saved login (config file).', run: logout },
  whoami: { flags: {}, help: 'Usage: linkjar whoami\n\nShows the account and workspace the CLI is using.', run: whoami },
  send: {
    flags: { title: 'string', for: 'array', ...LINK_SETTINGS },
    help: `Usage: linkjar send <path|-> [options]

Publishes a file and prints its link (first line of output).
  path: .pdf, .doc(x), .ppt(x), .xls(x), .html/.htm, .zip, or a folder with an
        index.html at its top (sent as a website). "-" reads HTML from stdin.

Options:
  --title <text>          Title shown to viewers (default: file name or <title>)
  --for "Name <email>"    Also make a personal link for this person (repeatable)${SETTINGS_HELP}

Examples:
  linkjar send deck.pdf
  linkjar send proposal.html --for "Sam Lee <sam@acme.com>" --for "priya@acme.com"
  linkjar send ./site --title "Q4 plan" --email-gate --domains acme.com
  cat page.html | linkjar send - --title "One-pager"`,
    run: send,
  },
  update: {
    flags: { title: 'string' },
    help: `Usage: linkjar update <ref> <path|-> [--title <text>]

Replaces what an existing link shows. Everyone who has the link sees the new
version. Accepts the same kinds of path as send.

Examples:
  linkjar update acme-proposal proposal-v2.html
  linkjar update https://linkjar.com/acme-proposal ./site`,
    run: update,
  },
  list: {
    flags: { query: 'string', limit: 'string' },
    help: `Usage: linkjar list [--query <text>] [--limit <n>]

Recent documents with their links and view counts.

Examples:
  linkjar list
  linkjar list --query acme --json`,
    run: list,
  },
  activity: {
    flags: { days: 'string', limit: 'string' },
    help: `Usage: linkjar activity <ref> [--days <n>] [--limit <n>]

Who opened it, when, from where; on Pro also time spent, how far they read
and what they clicked. Alias: linkjar views.

Examples:
  linkjar activity acme-proposal
  linkjar activity acme-proposal --days 7 --json`,
    run: activity,
  },
  responses: {
    flags: { limit: 'string', csv: 'boolean', 'save-signed': 'string' },
    help: `Usage: linkjar responses <ref> [--limit <n>] [--csv] [--save-signed <dir>]

What people filled in, signed and submitted on a fillable PDF: who, when and
their answers. Signed responses show who signed, when and where.

  --csv                 One row per response (columns: Submitted at, Respondent,
                        Respondent email, the signature columns when anything was
                        signed, then every field), ready for a spreadsheet
  --save-signed <dir>   Download each signed PDF (with its signature certificate)
                        into <dir>

Examples:
  linkjar responses order-form
  linkjar responses order-form --csv > responses.csv
  linkjar responses agreement --save-signed ./signed
  linkjar responses order-form --json`,
    run: responses,
  },
  link: {
    flags: { name: 'string', email: 'string' },
    help: `Usage: linkjar link <ref> --name <name> [--email <email>]

A personal link for one person, so their views show under their name.

Examples:
  linkjar link acme-proposal --name "Sam Lee" --email sam@acme.com`,
    run: link,
  },
  settings: {
    flags: { title: 'string', ...LINK_SETTINGS, 'remove-password': 'boolean', 'remove-expiry': 'boolean', 'remove-cta': 'boolean' },
    help: `Usage: linkjar settings <ref> [options]

Changes how a link behaves. Only the options you pass change.

Options:
  --title <text>${SETTINGS_HELP}
  --no-email-gate         Turn the email gate off
  --remove-password       Turn password protection off
  --remove-expiry         Remove the expiry date
  --remove-cta            Remove the button

Examples:
  linkjar settings acme-proposal --password hunter22 --expires 2026-12-31
  linkjar settings acme-proposal --remove-password --no-email-gate`,
    run: settings,
  },
  room: {
    flags: { description: 'string', 'email-gate': 'boolean' },
    help: `Usage: linkjar room <title> <ref...> [--description <text>] [--email-gate]

Puts several documents behind one link (a deal room). Pro.

Examples:
  linkjar room "Acme deal room" acme-proposal case-study security-faq --email-gate`,
    run: room,
  },
  open: { flags: {}, help: 'Usage: linkjar open <ref>\n\nOpens the document\'s settings page in your browser.', run: open },
  skills: {
    flags: { dir: 'string' },
    help: `Usage: linkjar skills [list]
       linkjar skills install [name...] [--dir <folder>]

Agent skills teach Claude Code (and other agents) to write proposals, pitch
decks, one-pagers and case studies, send them with this CLI and follow up.
install downloads them into ~/.claude/skills/ (or --dir); with no names it
installs all of them. No login needed.

Examples:
  linkjar skills
  linkjar skills install
  linkjar skills install proposal follow-up
  linkjar skills install --dir ./.claude/skills     # just this project`,
    run: skills,
  },
};
COMMANDS.views = COMMANDS.activity;

// --- helpers -------------------------------------------------------------------

function settingsBody(flags) {
  const body = {};
  if (flags.password !== undefined) body.password = flags.password;
  if (flags['email-gate'] !== undefined) body.require_email = flags['email-gate'];
  if (flags.domains !== undefined) body.allowed_email_domains = flags.domains;
  if (flags.expires !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flags.expires)) throw new UsageError('--expires must be a date like 2026-12-31');
    body.expires_on = flags.expires;
  }
  if (flags['cta-label'] !== undefined) body.cta_label = flags['cta-label'];
  if (flags['cta-url'] !== undefined) body.cta_url = flags['cta-url'];
  if (flags.title !== undefined) body.title = flags.title;
  return body;
}

function htmlTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

// A path or "-" → what to upload: {json: {html}} or {file: {name, data}}.
async function readContent(path, io) {
  if (path === '-') {
    const html = await readStdin(io.stdin);
    if (!html.trim()) throw new UsageError('Nothing on stdin. Pipe in a complete HTML document.');
    return { html, title: htmlTitle(html) };
  }
  let st;
  try {
    st = statSync(path);
  } catch {
    throw new UsageError(`No such file or folder: ${path}`);
  }
  const name = basename(path.replace(/[/\\]+$/, '')) || 'site';
  if (st.isDirectory()) return { file: { name: name + '.zip', data: zipDirectory(path) }, title: name };
  return { file: { name, data: readFileSync(path) }, title: name.slice(0, name.length - extname(name).length) };
}

function multipart(file, fields) {
  const form = new FormData();
  form.append('file', new Blob([file.data]), file.name);
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) form.append(k, typeof v === 'boolean' ? String(v) : v);
  }
  return form;
}

function refPath(ref) {
  return '/api/v1/documents/' + encodeURIComponent(parseRef(ref));
}

function need(positionals, n, usage) {
  if (positionals.length < n) throw new UsageError(usage);
}

function warn(io, data) {
  for (const w of data.warnings || []) io.err(`Warning: ${w}`);
}

// --- commands ---------------------------------------------------------------------

async function login(ctx) {
  const { flags, io, env } = ctx;
  const config = loadConfig(env);
  const base = baseUrl(ctx.globals, env, config);
  if (flags.key) {
    if (!flags.key.startsWith('lj_')) throw new UsageError('API keys start with lj_. Create one in Settings → Claude, CLI & API.');
    config.auth = { api_key: flags.key };
  } else {
    config.auth = await oauthLogin({ base, config, noBrowser: flags['no-browser'], log: io.err });
  }
  if (ctx.globals.url) config.url = base;
  saveConfig(config, env);
  const me = await new Client({ base, env: { ...env, LINKJAR_API_KEY: '' }, config }).get('/api/v1/me');
  if (ctx.globals.json) return io.json(me);
  io.out(`Logged in as ${me.user?.email} (workspace: ${me.workspace?.name}).`);
}

async function logout({ io, env }) {
  deleteConfig(env);
  io.out(`Logged out (removed ${configPath(env)}).`);
  if (env.LINKJAR_API_KEY) io.err('Note: LINKJAR_API_KEY is still set in your environment.');
}

async function whoami({ client, io, globals }) {
  const me = await client.get('/api/v1/me');
  if (globals.json) return io.json(me);
  io.out(`${me.user?.email}\nWorkspace: ${me.workspace?.name} (${me.workspace?.plan || 'free'})\nServer: ${client.base}`);
}

async function send({ client, flags, positionals, io, globals }) {
  need(positionals, 1, 'Usage: linkjar send <path|-> [options]. See linkjar send --help');
  const people = (flags.for || []).map(parsePerson);
  const body = settingsBody(flags);
  const content = await readContent(positionals[0], io);
  // Uploads: the server takes the page's <title>, else the file name.
  if (flags.title) body.title = flags.title;
  else if (!content.file) body.title = content.title || 'Untitled';
  const data = content.file
    ? await client.request('POST', '/api/v1/documents', { form: multipart(content.file, body) })
    : await client.post('/api/v1/documents', { ...body, html: content.html });
  const recipients = [];
  for (const person of people) {
    const r = await client.post(refPath(data.slug || data.link) + '/recipients', person);
    recipients.push({ ...person, link: r.link });
  }
  if (globals.json) return io.json(recipients.length ? { ...data, recipients } : data);
  io.out(data.link);
  for (const r of recipients) io.out(`${r.name || r.email}: ${r.link}`);
  if (data.status === 'Converting') io.err('Converting to PDF; the link works in a minute or two.');
  if (data.review_status === 'held') io.err('Held for a quick safety review; the link shows "not available" until approved.');
  warn(io, data);
  if (data.settings_url) io.err(`Settings: ${data.settings_url}`);
}

async function update({ client, flags, positionals, io, globals }) {
  need(positionals, 2, 'Usage: linkjar update <ref> <path|->. See linkjar update --help');
  const content = await readContent(positionals[1], io);
  const fields = flags.title ? { title: flags.title } : {};
  const path = refPath(positionals[0]) + '/content';
  const data = content.file
    ? await client.request('PUT', path, { form: multipart(content.file, fields) })
    : await client.put(path, { ...fields, html: content.html });
  if (globals.json) return io.json(data);
  io.out(data.link);
  if (data.message) io.err(data.message);
  warn(io, data);
}

async function list({ client, flags, io, globals }) {
  const data = await client.get('/api/v1/documents', { query: flags.query, limit: flags.limit });
  if (globals.json) return io.json(data);
  const docs = data.documents || [];
  if (!docs.length) return io.out('No documents yet. Send one with: linkjar send <file>');
  for (const d of docs) io.out(`${d.link}  ${d.title} (${d.kind}, ${d.views} views, ${d.created})`);
}

async function activity({ client, flags, positionals, io, globals }) {
  need(positionals, 1, 'Usage: linkjar activity <ref>. See linkjar activity --help');
  const data = await client.get(refPath(positionals[0]) + '/activity', { days: flags.days, limit: flags.limit });
  if (globals.json) return io.json(data);
  if (data.message) return io.out(data.message);
  io.out(`"${data.title}": ${data.total_views} views in total.`);
  for (const v of data.views || []) {
    const bits = [v.time, v.completion_pct != null ? `${v.completion_pct}% through` : '', v.engagement].filter((b) => b && b !== '–');
    io.out(`- ${(v.when || '?').slice(0, 16).replace('T', ' ')}: ${v.who}${v.where ? ` (${v.where})` : ''}${bits.length ? ': ' + bits.join(', ') : ''}`);
  }
}

function csvCell(value) {
  let text;
  if (Array.isArray(value)) text = value.join(', ');
  else if (value && typeof value === 'object') text = value.type === 'signature' ? `Signed by ${value.signer_name || ''}` : '';
  else text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function responsesCsv(rows) {
  const names = [];
  for (const r of [...rows].reverse()) for (const n of Object.keys(r.fields || {})) if (!names.includes(n)) names.push(n);
  const signed = rows.some((r) => r.signed);
  const signedCols = signed ? ['Signed by', 'Signed at', 'Signer IP', 'Signer location'] : [];
  const lines = [['Submitted at', 'Respondent', 'Respondent email', ...signedCols, ...names].map(csvCell).join(',')];
  for (const r of [...rows].reverse()) {
    const a = r.audit || {};
    const signedValues = signed ? [r.signer_name, a.signed_at, a.ip, a.location] : [];
    lines.push([r.when, r.who, r.email, ...signedValues, ...names.map((n) => (r.fields || {})[n])].map(csvCell).join(','));
  }
  return lines.join('\n');
}

async function responses({ client, flags, positionals, io, globals }) {
  need(positionals, 1, 'Usage: linkjar responses <ref>. See linkjar responses --help');
  const data = await client.get(refPath(positionals[0]) + '/responses', { limit: flags.limit });
  if (globals.json) return io.json(data);
  if (flags['save-signed']) return saveSigned(client, positionals[0], data.responses || [], flags['save-signed'], io);
  if (flags.csv) return io.out(responsesCsv(data.responses || []));
  io.out(data.message || `"${data.title}": ${data.total} responses.`);
}

async function saveSigned(client, ref, rows, dir, io) {
  const signed = rows.filter((r) => r.signed);
  if (!signed.length) return io.out('No signed responses yet.');
  mkdirSync(dir, { recursive: true });
  for (const r of signed) {
    if (!r.signed_pdf_ready) {
      io.err(`${r.signer_name}: the signed copy is still being prepared; try again in a minute.`);
      continue;
    }
    const bytes = await client.download(`${refPath(ref)}/responses/${r.id}/signed.pdf`);
    const safe = (r.signer_name || 'signed').replace(/[^\w\- ]+/g, '').trim() || 'signed';
    const file = join(dir, `${safe} ${(r.when || '').slice(0, 10)} ${r.id.slice(0, 8)}.pdf`);
    writeFileSync(file, bytes);
    io.out(file);
  }
}

async function link({ client, flags, positionals, io, globals }) {
  need(positionals, 1, 'Usage: linkjar link <ref> --name <name> [--email <email>]');
  if (!flags.name && !flags.email) throw new UsageError('Pass --name and/or --email for the person this link is for.');
  const data = await client.post(refPath(positionals[0]) + '/recipients', { name: flags.name || '', email: flags.email || '' });
  if (globals.json) return io.json(data);
  io.out(data.link);
}

async function settings({ client, flags, positionals, io, globals }) {
  need(positionals, 1, 'Usage: linkjar settings <ref> [options]. See linkjar settings --help');
  const body = settingsBody(flags);
  for (const k of ['remove-password', 'remove-expiry', 'remove-cta']) if (flags[k]) body[k.replace('-', '_')] = true;
  if (!Object.keys(body).length) {
    const data = await client.get(refPath(positionals[0]));
    if (globals.json) return io.json(data);
    io.out(data.link);
    for (const [k, v] of Object.entries(data.settings || {})) io.out(`  ${k}: ${v === null || v === '' ? '-' : v}`);
    return;
  }
  const data = await client.patch(refPath(positionals[0]), body);
  if (globals.json) return io.json(data);
  io.out(data.link);
  if (data.message) io.err(data.message);
}

async function room({ client, flags, positionals, io, globals }) {
  need(positionals, 2, 'Usage: linkjar room <title> <ref...>. See linkjar room --help');
  const [title, ...refs] = positionals;
  const body = { title, documents: refs.map(parseRef) };
  if (flags.description) body.description = flags.description;
  if (flags['email-gate'] !== undefined) body.require_email = flags['email-gate'];
  const data = await client.post('/api/v1/rooms', body);
  if (globals.json) return io.json(data);
  io.out(data.link);
}

async function open({ client, positionals, io, globals }) {
  need(positionals, 1, 'Usage: linkjar open <ref>');
  const data = await client.get(refPath(positionals[0]));
  if (globals.json) return io.json(data);
  io.out(data.settings_url);
  openBrowser(data.settings_url);
}

// --- skills ---------------------------------------------------------------------

async function fetchPublic(url, kind = 'json') {
  const res = await fetch(url, { headers: { 'User-Agent': 'linkjar-cli' } });
  if (!res.ok) throw new Error(`Couldn't download ${url} (${res.status})`);
  return kind === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
}

async function skills({ client, flags, positionals, io, globals }) {
  const [sub = 'list', ...names] = positionals;
  if (sub !== 'list' && sub !== 'install') throw new UsageError('Usage: linkjar skills [list|install]. See linkjar skills --help');
  const index = await fetchPublic(client.base + '/skills/index.json');
  const available = index.skills || [];
  if (sub === 'list') {
    if (globals.json) return io.json(index);
    for (const s of available) io.out(`${s.name.padEnd(12)} ${s.summary || s.description}`);
    io.err('Install: linkjar skills install [name...]');
    return;
  }
  const known = new Set(available.map((s) => s.name));
  const chosen = names.length ? names : [...known];
  for (const name of chosen) {
    if (!known.has(name)) throw new UsageError(`No skill called "${name}". Available: ${[...known].join(', ')}`);
  }
  const dir = flags.dir || join(homedir(), '.claude', 'skills');
  const installed = [];
  for (const name of chosen) {
    const files = unzipEntries(await fetchPublic(`${client.base}/skills/${encodeURIComponent(name)}.zip`, 'binary'));
    for (const file of files) {
      // Each archive holds one folder named after the skill.
      if (!file.name.startsWith(name + '/')) throw new Error(`Unexpected file in ${name}.zip: ${file.name}`);
      const target = join(dir, file.name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.data);
    }
    installed.push({ name, path: join(dir, name) });
  }
  if (globals.json) return io.json({ installed });
  for (const s of installed) io.out(`Installed ${s.name} → ${s.path}`);
  io.err('Start a new Claude Code session to pick them up.');
}

// What the docs site shows for the CLI (scripts/docs.js writes docs/commands.json).
export function commandDocs() {
  return {
    version: VERSION,
    main_help: MAIN_HELP,
    commands: Object.entries(COMMANDS)
      .filter(([name]) => name !== 'views') // an alias of activity
      .map(([name, cmd]) => ({ name, help: cmd.help })),
  };
}

// --- entry ------------------------------------------------------------------------

export async function main(argv, { env = process.env, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  const io = {
    stdin,
    out: (s) => stdout.write(s + '\n'),
    err: (s) => stderr.write(s + '\n'),
    json: (d) => stdout.write(JSON.stringify(d, null, 2) + '\n'),
  };
  try {
    // The command is the first bare word, skipping global options (and --url's value).
    let at = 0;
    while (at < argv.length && argv[at].startsWith('-') && argv[at] !== '-') at += argv[at] === '--url' ? 2 : 1;
    const name = argv[at];
    const cmd = name ? COMMANDS[name] : null;
    if (name && !cmd) throw new UsageError(`Unknown command: ${name}. Run linkjar --help`);
    const rest = name ? [...argv.slice(0, at), ...argv.slice(at + 1)] : argv;
    const { flags, positionals } = parseArgs(rest, { ...GLOBAL, ...(cmd?.flags || {}) }, ALIASES);
    if (flags.version) return io.out(VERSION), 0;
    if (!cmd || flags.help) return io.out(cmd ? cmd.help : MAIN_HELP), 0;
    const globals = { json: flags.json, url: flags.url };
    const config = loadConfig(env);
    const client = new Client({ base: baseUrl(globals, env, config), env, config });
    await cmd.run({ client, flags, positionals, io, env, globals });
    return 0;
  } catch (err) {
    io.err(`Error: ${err.message}`);
    return err instanceof UsageError ? 2 : 1;
  }
}
