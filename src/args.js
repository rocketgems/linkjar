// Small argv parser. `spec` maps long flag names to 'string' | 'boolean' | 'array'.
// Supports --flag value, --flag=value, --no-<bool>, -h, and `--` to end flags.
// A lone `-` is a positional (stdin).

export class UsageError extends Error {}

export function parseArgs(argv, spec = {}, aliases = {}) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '-' || !arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    let value;
    if (!arg.startsWith('--')) {
      const short = arg.slice(1);
      if (!aliases[short]) throw new UsageError(`Unknown option: ${arg}`);
      arg = '--' + aliases[short];
    }
    let name = arg.slice(2);
    const eq = name.indexOf('=');
    if (eq !== -1) {
      value = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    let type = spec[name];
    if (!type && name.startsWith('no-') && spec[name.slice(3)] === 'boolean') {
      flags[name.slice(3)] = false;
      continue;
    }
    if (!type) throw new UsageError(`Unknown option: --${name}`);
    if (type === 'boolean') {
      if (value !== undefined) flags[name] = !['false', '0', 'no'].includes(value.toLowerCase());
      else flags[name] = true;
      continue;
    }
    if (value === undefined) {
      if (i + 1 >= argv.length) throw new UsageError(`--${name} needs a value`);
      value = argv[++i];
    }
    if (type === 'array') (flags[name] ||= []).push(value);
    else flags[name] = value;
  }
  return { flags, positionals };
}

// "Sam Lee <sam@acme.com>", "sam@acme.com" or "Sam Lee" → {name, email}
export function parsePerson(text) {
  const s = String(text).trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() };
  if (/^[^\s@]+@[^\s@]+$/.test(s)) return { name: '', email: s };
  return { name: s, email: '' };
}

// A document reference: slug, uuid, or a full link → its last path segment.
export function parseRef(ref) {
  let s = String(ref || '').trim();
  if (!s) throw new UsageError('Which document? Pass its link, slug or id.');
  s = s.split('#')[0].split('?')[0].replace(/\/+$/, '');
  return s.slice(s.lastIndexOf('/') + 1);
}
