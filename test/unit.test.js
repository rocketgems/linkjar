import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { parseArgs, parsePerson, parseRef, UsageError } from '../src/args.js';
import { crc32, zipDirectory, zipEntries } from '../src/zip.js';

test('parseArgs: values, =, booleans, arrays, --no-, stdin dash', () => {
  const spec = { title: 'string', for: 'array', 'email-gate': 'boolean', json: 'boolean', help: 'boolean' };
  const { flags, positionals } = parseArgs(
    ['-', '--title', 'Q4 plan', '--for=Sam <s@a.com>', '--for', 'p@a.com', '--no-email-gate', '--json', '-h'],
    spec, { h: 'help' });
  assert.deepEqual(positionals, ['-']);
  assert.equal(flags.title, 'Q4 plan');
  assert.deepEqual(flags.for, ['Sam <s@a.com>', 'p@a.com']);
  assert.equal(flags['email-gate'], false);
  assert.equal(flags.json, true);
  assert.equal(flags.help, true);
});

test('parseArgs: errors and --', () => {
  assert.throws(() => parseArgs(['--nope'], {}), UsageError);
  assert.throws(() => parseArgs(['--title'], { title: 'string' }), /needs a value/);
  assert.deepEqual(parseArgs(['--', '--title'], { title: 'string' }).positionals, ['--title']);
});

test('parsePerson', () => {
  assert.deepEqual(parsePerson('Sam Lee <sam@acme.com>'), { name: 'Sam Lee', email: 'sam@acme.com' });
  assert.deepEqual(parsePerson('"Sam Lee" <sam@acme.com>'), { name: 'Sam Lee', email: 'sam@acme.com' });
  assert.deepEqual(parsePerson('sam@acme.com'), { name: '', email: 'sam@acme.com' });
  assert.deepEqual(parsePerson('Sam Lee'), { name: 'Sam Lee', email: '' });
});

test('parseRef', () => {
  assert.equal(parseRef('acme-proposal'), 'acme-proposal');
  assert.equal(parseRef('https://linkjar.com/acme-proposal/'), 'acme-proposal');
  assert.equal(parseRef('https://pdflink.to/acme-proposal?r=abc#p2'), 'acme-proposal');
  assert.equal(parseRef('0b6b0e9a-2f3c-4c7e-9d1a-3b2f1e0c9a11'), '0b6b0e9a-2f3c-4c7e-9d1a-3b2f1e0c9a11');
  assert.throws(() => parseRef(''), UsageError);
});

test('crc32 known value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

// Reads entries back from our own zip (central directory → local data).
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const localNameLen = buf.readUInt16LE(offset + 26);
    const body = buf.subarray(offset + 30 + localNameLen, offset + 30 + localNameLen + size);
    out[name] = (method === 8 ? inflateRawSync(body) : body).toString('utf8');
    p += 46 + nameLen;
  }
  return out;
}

test('zipDirectory round-trips and passes an external zip check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-zip-'));
  mkdirSync(join(dir, 'img'));
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Hi</title>' + 'x'.repeat(500));
  writeFileSync(join(dir, 'img', 'a.svg'), '<svg/>');
  writeFileSync(join(dir, 'node_modules', 'skip.js'), 'nope');
  const buf = zipDirectory(dir);
  const files = readZip(buf);
  assert.deepEqual(Object.keys(files).sort(), ['img/a.svg', 'index.html']);
  assert.equal(files['img/a.svg'], '<svg/>');
  const zipPath = join(dir, 'out.zip');
  writeFileSync(zipPath, buf);
  let checked = false;
  for (const [cmd, args] of [['unzip', ['-t', zipPath]], ['python3', ['-I', '-m', 'zipfile', '-t', zipPath]]]) {
    try {
      execFileSync(cmd, args, { stdio: 'pipe' });
      checked = true;
      break;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  if (!checked) console.log('(no unzip/python3 available; skipped external check)');
});

test('zipDirectory needs index.html', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lj-zip-'));
  writeFileSync(join(dir, 'page.html'), 'x');
  assert.throws(() => zipDirectory(dir), /index\.html/);
});

test('zipEntries empty archive is valid', () => {
  assert.equal(zipEntries([]).length, 22);
});
