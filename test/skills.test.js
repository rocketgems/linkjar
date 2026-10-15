import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { after, before, test } from 'node:test';
import { commandDocs, main } from '../src/commands.js';
import { unzipEntries, zipEntries } from '../src/zip.js';

let server, base;
const zips = {
  proposal: zipEntries([{ name: 'proposal/SKILL.md', data: Buffer.from('---\nname: proposal\n---\n# Proposal\n') },
                        { name: 'proposal/template.html', data: Buffer.from('<!doctype html><title>t</title>') }]),
  evil: zipEntries([{ name: '../escape.txt', data: Buffer.from('nope') }]),
};

function capture() {
  let text = '';
  return { stream: new Writable({ write(c, _e, cb) { text += c; cb(); } }), get text() { return text; } };
}

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/skills/index.json') {
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ skills: [
        { name: 'proposal', description: 'Write a client proposal' }, { name: 'evil', description: 'bad zip' }] }));
    }
    const m = req.url.match(/^\/skills\/([a-z-]+)\.zip$/);
    if (m && zips[m[1]]) return res.writeHead(200, { 'Content-Type': 'application/zip' }).end(zips[m[1]]);
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function run(args) {
  const out = capture(), err = capture();
  const env = { LINKJAR_URL: base, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'lj-')) };
  const code = await main(args, { env, stdout: out.stream, stderr: err.stream });
  return { code, out: out.text, err: err.text };
}

test('skills lists without logging in', async () => {
  const r = await run(['skills']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^proposal\s+Write a client proposal/m);
});

test('skills install unpacks into the folder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-skills-'));
  const r = await run(['skills', 'install', 'proposal', '--dir', dir]);
  assert.equal(r.code, 0, r.err);
  assert.match(readFileSync(join(dir, 'proposal', 'SKILL.md'), 'utf8'), /# Proposal/);
  assert.ok(existsSync(join(dir, 'proposal', 'template.html')));
});

test('skills install refuses unknown names and unsafe archives', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-skills-'));
  const unknown = await run(['skills', 'install', 'nope', '--dir', dir]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /No skill called "nope"/);
  const evil = await run(['skills', 'install', 'evil', '--dir', dir]);
  assert.equal(evil.code, 1);
  assert.match(evil.err, /Unsafe path/);
  assert.ok(!existsSync(join(dir, '..', 'escape.txt')));
});

test('unzip round-trips stored and deflated entries', () => {
  const files = unzipEntries(zips.proposal);
  assert.deepEqual(files.map((f) => f.name), ['proposal/SKILL.md', 'proposal/template.html']);
  assert.match(files[0].data.toString(), /name: proposal/);
});

test('docs/commands.json is up to date (run npm run docs)', () => {
  const committed = JSON.parse(readFileSync(new URL('../docs/commands.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, commandDocs());
});
