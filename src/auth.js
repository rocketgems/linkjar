// `linkjar login`: OAuth 2.1 + PKCE with a loopback redirect, against the same
// OAuth server the Claude connector uses. The token goes straight into the
// config file; it is never printed.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { openBrowser } from './util.js';

const PORTS = [53682, 53683, 53684, 53685, 53686];

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function openServer(preferred, ports) {
  const order = preferred ? [preferred, ...ports.filter((p) => p !== preferred)] : ports;
  for (const port of order) {
    try {
      return { server: await listen(port), port: port || 0 };
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(`Ports ${ports.join(', ')} are all busy; close whatever is using them and try again.`);
}

const PAGE = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#0f172a">
<div style="text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#475569">${text}</p></div>`;

export async function oauthLogin({ base, config, noBrowser = false, log = console.error, ports = PORTS, timeoutMs = 5 * 60 * 1000 }) {
  // Reuse the registered client when it was made for this server (the
  // redirect URI, port included, must match what was registered).
  const saved = config.oauth_client && config.oauth_client.base === base ? config.oauth_client : null;
  const { server, port: boundPort } = await openServer(saved?.port, ports);
  const port = boundPort || server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  try {
    let clientId = saved && saved.port === port ? saved.client_id : null;
    if (!clientId) {
      const res = await fetch(base + '/mcp/oauth/register/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Linkjar CLI', redirect_uris: [redirectUri] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.client_id) throw new Error(`Could not register the CLI with ${base}: ${data.error_description || data.error || res.status}`);
      clientId = data.client_id;
      config.oauth_client = { base, port, client_id: clientId };
    }

    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const state = b64url(randomBytes(16));
    const authUrl = base + '/mcp/oauth/authorize/?' + new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
      code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'read write',
    });

    const codePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for the browser. Run `linkjar login` again.')), timeoutMs);
      server.on('request', (req, res) => {
        const url = new URL(req.url, redirectUri);
        if (url.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        const error = url.searchParams.get('error');
        if (error || url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
          res.writeHead(400, { 'Content-Type': 'text/html' }).end(PAGE('Login failed', 'Go back to the terminal and try again.'));
          clearTimeout(timer);
          reject(new Error(error === 'access_denied' ? 'Login cancelled.' : `Login failed${error ? ': ' + error : ''}.`));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE('You are logged in', 'You can close this tab and go back to the terminal.'));
        clearTimeout(timer);
        resolve(url.searchParams.get('code'));
      });
    });

    log(`Open this link to log in:\n\n  ${authUrl}\n`);
    if (!noBrowser) openBrowser(authUrl);
    log('Waiting for you to approve in the browser...');
    const code = await codePromise;

    const res = await fetch(base + '/_/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }),
    });
    const token = await res.json().catch(() => ({}));
    if (!res.ok || !token.access_token) throw new Error(`Could not finish logging in: ${token.error_description || token.error || res.status}`);
    return { client_id: clientId, access_token: token.access_token, refresh_token: token.refresh_token };
  } finally {
    server.close();
  }
}
