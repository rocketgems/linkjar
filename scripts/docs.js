// Writes docs/commands.json, which the website's /docs/cli/ page renders.
// `npm test` fails if it's stale, so run `npm run docs` after changing help text.
import { writeFileSync } from 'node:fs';
import { commandDocs } from '../src/commands.js';

writeFileSync(new URL('../docs/commands.json', import.meta.url), JSON.stringify(commandDocs(), null, 2) + '\n');
