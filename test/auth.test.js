import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { oauthLogin } from '../src/auth.js';

test('oauthLogin: register, PKCE, loopback callback, token exchange; reuses the client', async () => {
  let registrations = 0, challenge;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString();
    if (req.url === '/mcp/oauth/register/') {
      registrations++;
      assert.match(JSON.parse(body).redirect_uris[0], /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      return res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ client_id: 'cid' }));
    }
    if (req.url === '/_/oauth/token/') {
      const f = new URLSearchParams(body);
      const ok = f.get('code') === 'abc' && f.get('client_id') === 'cid'
        && createHash('sha256').update(f.get('code_verifier')).digest('base64url') === challenge;
      return res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(ok ? { access_token: 'at', refresh_token: 'rt' } : { error: 'invalid_grant' }));
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = {};
  // Plays the browser: approve by hitting the redirect URI with the state.
  const log = (msg) => {
    const m = msg.match(/(http\S+\/mcp\/oauth\/authorize\/\S+)/);
    if (!m) return;
    const u = new URL(m[1]);
    challenge = u.searchParams.get('code_challenge');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    const cb = new URL(u.searchParams.get('redirect_uri'));
    cb.searchParams.set('code', 'abc');
    cb.searchParams.set('state', u.searchParams.get('state'));
    setTimeout(() => fetch(cb).then((r) => r.text()), 10);
  };
  const ports = [0];
  const auth = await oauthLogin({ base, config, noBrowser: true, log, ports });
  assert.deepEqual(auth, { client_id: 'cid', access_token: 'at', refresh_token: 'rt' });
  assert.equal(config.oauth_client.client_id, 'cid');
  server.close();
  assert.equal(registrations, 1);
});
