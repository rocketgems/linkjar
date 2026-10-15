#!/usr/bin/env node
import { main } from '../src/commands.js';

process.exitCode = await main(process.argv.slice(2));
