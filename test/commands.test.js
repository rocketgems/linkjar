import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { after, before, test } from 'node:test';
import { main } from '../src/commands.js';

// A fake Linkjar API that records requests.
let server, base;
const seen = [];
let validToken = 'good-token';

function capture() {
  let text = '';
  return { stream: new Writable({ write(c, _e, cb) { text += c; cb(); } }), get text() { return text; } };
}

before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    const json = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    if (req.url === '/_/oauth/token/') {
      const form = new URLSearchParams(body.toString());
      if (form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'r1' && form.get('client_id') === 'cid') {
        validToken = 'fresh-token';
        return json(200, { access_token: 'fresh-token', refresh_token: 'r2', expires_in: 3600 });
      }
      return json(400, { error: 'invalid_grant' });
    }
    if (req.headers.authorization !== `Bearer ${validToken}`) return json(401, { error: 'Invalid or expired token.' });
    if (req.method === 'POST' && req.url === '/api/v1/documents') {
      return json(201, { link: base + '/acme-proposal', slug: 'acme-proposal', kind: 'html', status: 'Published',
        review_status: 'ok', settings_url: base + '/document/x/update/', warnings: ['img.png is missing'], message: 'Published' });
    }
    if (req.method === 'POST' && req.url === '/api/v1/documents/acme-proposal/recipients') {
      const p = JSON.parse(body.toString());
      return json(201, { link: base + '/acme-proposal?r=' + (p.email || p.name), message: 'ok' });
    }
    if (req.method === 'GET' && req.url.startsWith('/api/v1/documents/acme-proposal/activity')) {
      return json(200, { title: 'Acme proposal', total_views: 2, views: [
        { when: '2026-10-15T09:14:00Z', who: 'Sam Lee', where: 'Chicago', device: 'Mac', time: '3m', completion_pct: 94, engagement: 'clicked Book a call' },
        { when: '2026-10-15T10:00:00Z', who: 'Anonymous', where: '', device: '' },
      ] });
    }
    if (req.method === 'GET' && req.url.startsWith('/api/v1/documents/order-form/responses')) {
      return json(200, { title: 'Order form', total: 2, message: '"Order form": 2 responses.', responses: [
        { when: '2026-10-15T10:00:00Z', who: 'Bo', email: 'bo@x.com', fields: { full_name: 'Bo, Jr.', size: ['M', 'L'] } },
        { when: '2026-10-15T09:00:00Z', who: 'Ann', email: '', fields: { full_name: 'Ann', agree: 'Yes' } },
      ] });
    }
    if (req.method === 'GET' && req.url.startsWith('/api/v1/documents/agreement/responses/')) {
      return res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(Buffer.from('%PDF-1.7 signed ' + req.url));
    }
    if (req.method === 'GET' && req.url.startsWith('/api/v1/documents/agreement/responses')) {
      return json(200, { title: 'Agreement', total: 2, message: '"Agreement": 2 responses.\n- 2026-10-15 18:00, Sam Lee: signature: Signed by Sam Lee [SIGNED by Sam Lee at 2026-10-15 18:00, Chicago]', responses: [
        { id: 'aaaaaaaa-1111-2222-3333-444444444444', when: '2026-10-15T18:00:00Z', who: 'Sam Lee', email: 'sam@acme.com', signed: true, signer_name: 'Sam Lee',
          signed_pdf_ready: true, audit: { signed_at: '2026-10-15T18:00:00Z', ip: '203.0.113.9', location: 'Chicago' },
          fields: { full_name: 'Sam Lee', signature: { type: 'signature', signer_name: 'Sam Lee', method: 'draw' } } },
        { id: 'bbbbbbbb-1111-2222-3333-444444444444', when: '2026-10-15T17:00:00Z', who: 'Ann', email: '', signed: false, fields: { full_name: 'Ann' } },
      ] });
    }
    json(404, { error: 'Not found' });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function run(argv, { env = {}, stdin = '' } = {}) {
  const out = capture(), err = capture();
  const code = await main(argv, { env: { LINKJAR_URL: base, ...env }, stdin: Readable.from([stdin]), stdout: out.stream, stderr: err.stream });
  return { code, out: out.text, err: err.text };
}

test('send a file with personal links prints the link first', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-cmd-'));
  const file = join(dir, 'proposal.html');
  writeFileSync(file, '<!doctype html><title>Acme</title><h1>Hi</h1>');
  seen.length = 0;
  const r = await run(['send', file, '--password', 'hunter22', '--email-gate', '--for', 'Sam Lee <sam@acme.com>'],
    { env: { LINKJAR_API_KEY: 'good-token', XDG_CONFIG_HOME: dir } });
  assert.equal(r.code, 0, r.err);
  const lines = r.out.trim().split('\n');
  assert.equal(lines[0], base + '/acme-proposal');
  assert.equal(lines[1], `Sam Lee: ${base}/acme-proposal?r=sam@acme.com`);
  assert.match(r.err, /Warning: img.png is missing/);
  const upload = seen[0];
  assert.match(upload.headers['content-type'], /^multipart\/form-data/);
  const raw = upload.body.toString();
  assert.match(raw, /filename="proposal.html"/);
  assert.match(raw, /name="password"\r\n\r\nhunter22/);
  assert.match(raw, /name="require_email"\r\n\r\ntrue/);
  assert.doesNotMatch(raw, /name="title"/); // the server reads the page <title>
  assert.ok(!r.out.includes('good-token') && !r.err.includes('good-token'));
});

test('send - reads HTML from stdin as JSON with the <title>', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-cmd-'));
  seen.length = 0;
  const r = await run(['send', '-', '--json'], { env: { LINKJAR_API_KEY: 'good-token', XDG_CONFIG_HOME: dir }, stdin: '<html><title>One pager</title></html>' });
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(r.out).slug, 'acme-proposal');
  const body = JSON.parse(seen[0].body.toString());
  assert.equal(body.title, 'One pager');
  assert.match(body.html, /One pager/);
});

test('activity refreshes an expired OAuth token once and saves the new one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-cmd-'));
  const cfgDir = join(dir, 'linkjar');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(cfgDir);
  writeFileSync(join(cfgDir, 'config.json'), JSON.stringify({ auth: { access_token: 'old-token', refresh_token: 'r1', client_id: 'cid' } }));
  validToken = 'never-matches-old';
  const r = await run(['activity', `${base}/acme-proposal/`], { env: { XDG_CONFIG_HOME: dir } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /"Acme proposal": 2 views/);
  assert.match(r.out, /Sam Lee \(Chicago\): 3m, 94% through, clicked Book a call/);
  const saved = JSON.parse(readFileSync(join(cfgDir, 'config.json'), 'utf8'));
  assert.equal(saved.auth.access_token, 'fresh-token');
  assert.equal(saved.auth.refresh_token, 'r2');
  assert.equal(statSync(join(cfgDir, 'config.json')).mode & 0o777, 0o600);
  validToken = 'good-token';
});

test('API errors exit non-zero with the message', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-cmd-'));
  const r = await run(['activity', 'missing-doc'], { env: { LINKJAR_API_KEY: 'good-token', XDG_CONFIG_HOME: dir } });
  assert.equal(r.code, 1);
  assert.match(r.err, /Error: Not found/);
});

test('not logged in, unknown command, help', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-cmd-'));
  const env = { XDG_CONFIG_HOME: dir };
  assert.match((await run(['list'], { env })).err, /Not logged in/);
  assert.equal((await run(['nope'], { env })).code, 2);
  const help = await run(['send', '--help'], { env });
  assert.equal(help.code, 0);
  assert.match(help.out, /Usage: linkjar send/);
  assert.match((await run(['--url', base, '--help'], { env })).out, /Commands:/);
});

test('responses prints the summary, and --csv a spreadsheet oldest first', async () => {
  const env = { LINKJAR_API_KEY: 'good-token', XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lj-')) };
  validToken = 'good-token';
  const plain = await run(['responses', 'order-form'], { env });
  assert.equal(plain.code, 0, plain.err);
  assert.match(plain.out, /2 responses/);
  const csv = await run(['responses', 'order-form', '--csv'], { env });
  assert.equal(csv.out.trim(), [
    'Submitted at,Respondent,Respondent email,full_name,agree,size',
    '2026-10-15T09:00:00Z,Ann,,Ann,Yes,',
    '2026-10-15T10:00:00Z,Bo,bo@x.com,"Bo, Jr.",,"M, L"',
  ].join('\n'));
});

test('responses shows signatures, and --save-signed downloads each signed PDF', async () => {
  const env = { LINKJAR_API_KEY: 'good-token', XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lj-')) };
  validToken = 'good-token';
  const plain = await run(['responses', 'agreement'], { env });
  assert.match(plain.out, /SIGNED by Sam Lee at 2026-10-15 18:00, Chicago/);
  const csv = await run(['responses', 'agreement', '--csv'], { env });
  assert.equal(csv.out.trim().split('\n')[0], 'Submitted at,Respondent,Respondent email,Signed by,Signed at,Signer IP,Signer location,full_name,signature');
  assert.match(csv.out, /Sam Lee,2026-10-15T18:00:00Z,203.0.113.9,Chicago,Sam Lee,Signed by Sam Lee/);
  const dir = mkdtempSync(join(tmpdir(), 'lj-signed-'));
  const saved = await run(['responses', 'agreement', '--save-signed', dir], { env });
  assert.equal(saved.code, 0, saved.err);
  const files = saved.out.trim().split('\n');
  assert.equal(files.length, 1);
  assert.match(files[0], /Sam Lee 2026-10-15 aaaaaaaa\.pdf$/);
  assert.match(readFileSync(files[0], 'utf8'), /^%PDF-1.7 signed \/api\/v1\/documents\/agreement\/responses\/aaaaaaaa-1111-2222-3333-444444444444\/signed.pdf/);
});
