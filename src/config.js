import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_URL = 'https://linkjar.com';

export function configPath(env = process.env) {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'linkjar', 'config.json');
}

export function loadConfig(env = process.env) {
  try {
    return JSON.parse(readFileSync(configPath(env), 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(config, env = process.env) {
  const path = configPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function deleteConfig(env = process.env) {
  rmSync(configPath(env), { force: true });
}

export function baseUrl(flags = {}, env = process.env, config = loadConfig(env)) {
  return String(flags.url || env.LINKJAR_URL || config.url || DEFAULT_URL).replace(/\/+$/, '');
}
