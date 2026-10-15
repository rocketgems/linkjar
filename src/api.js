// HTTP client for the Linkjar API. Picks the credential (env key > saved key >
// saved OAuth token), and refreshes an OAuth token once on a 401.
import { loadConfig, saveConfig } from './config.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class Client {
  constructor({ base, env = process.env, config } = {}) {
    this.base = base;
    this.env = env;
    this.config = config || loadConfig(env);
  }

  credential() {
    if (this.env.LINKJAR_API_KEY) return { kind: 'env', token: this.env.LINKJAR_API_KEY };
    const auth = this.config.auth;
    if (auth?.api_key) return { kind: 'key', token: auth.api_key };
    if (auth?.access_token) return { kind: 'oauth', token: auth.access_token };
    return null;
  }

  async refresh() {
    const auth = this.config.auth;
    if (!auth?.refresh_token || !auth.client_id) return false;
    const res = await fetch(this.base + '/_/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refresh_token, client_id: auth.client_id }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.access_token) return false;
    this.config.auth = { ...auth, access_token: data.access_token, refresh_token: data.refresh_token || auth.refresh_token };
    saveConfig(this.config, this.env);
    return true;
  }

  async request(method, path, { json, form, query, binary } = {}) {
    const cred = this.credential();
    if (!cred) throw new ApiError('Not logged in. Run `linkjar login` (or set LINKJAR_API_KEY).', 401);
    let url = this.base + path;
    if (query) {
      const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
      if ([...q].length) url += '?' + q;
    }
    const send = (token) => {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'linkjar-cli' };
      let body;
      if (form) body = form;
      else if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
      }
      return fetch(url, { method, headers, body });
    };
    let res = await send(cred.token);
    if (res.status === 401 && cred.kind === 'oauth' && (await this.refresh())) {
      res = await send(this.config.auth.access_token);
    }
    if (binary && res.ok) return Buffer.from(await res.arrayBuffer());
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text.slice(0, 300) || res.statusText };
    }
    if (!res.ok) {
      // Our API sends {error: "..."}; anything else (a proxy, the wrong server) may not.
      const err = data.error && typeof data.error === 'object' ? data.error.message : data.error;
      let msg = (typeof err === 'string' && err) || `Request failed (${res.status})`;
      if (res.status === 401) msg += cred.kind === 'env' ? ' Check LINKJAR_API_KEY.' : ' Run `linkjar login` again.';
      throw new ApiError(msg, res.status);
    }
    return data;
  }

  get(path, query) { return this.request('GET', path, { query }); }
  download(path) { return this.request('GET', path, { binary: true }); }
  post(path, json) { return this.request('POST', path, { json }); }
  patch(path, json) { return this.request('PATCH', path, { json }); }
  put(path, json) { return this.request('PUT', path, { json }); }
}
