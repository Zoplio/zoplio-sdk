#!/usr/bin/env node
// Fails when a developer-facing doc or example carries a literal date that is
// already in the past or less than 30 days away. Copy-pasted examples with a
// stale date book nothing (or book the past), so an example must either be
// date-free, compute its date from today, or use a date far in the future.
//
// Usage: node check-sdk-example-dates.mjs [root ...]
//   With no argument it scans packages/sdk-js, packages/sdk-python,
//   packages/claude-tool and docs/api next to this script's parent directory.
//   The public zoplio-sdk repo's CI runs it with the repo root (`.`).
//
// Scanned: *.md, *.yaml, *.yml and SDK sources (*.ts, *.js, *.py) outside
// tests. Skipped: CHANGELOG.md (history is supposed to be dated), tests,
// build output and caches, and any line that names an MCP `protocolVersion`
// (a spec identifier, not a calendar date).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_DAYS_AHEAD = 30;
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.turbo', '__pycache__', '.mypy_cache',
  '.pytest_cache', '.venv', 'venv', '__tests__', 'tests', 'test',
]);
const SKIP_FILES = new Set(['CHANGELOG.md', 'package-lock.json']);
const EXTENSIONS = ['.md', '.yaml', '.yml', '.ts', '.js', '.mjs', '.py'];
const DATE = /\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoots = ['packages/sdk-js', 'packages/sdk-python', 'packages/claude-tool', 'docs/api']
  .map((p) => resolve(here, '..', p));
const roots = process.argv.length > 2 ? process.argv.slice(2).map((p) => resolve(p)) : defaultRoots;

const today = new Date();
const floor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + MIN_DAYS_AHEAD));
const floorIso = floor.toISOString().slice(0, 10);

function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name) || name.endsWith('.egg-info')) continue;
    yield* walk(join(path, name));
  }
}

const problems = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const name = file.split(/[\\/]/).pop();
    if (SKIP_FILES.has(name) || name.includes('.test.') || name.startsWith('test_')) continue;
    if (!EXTENSIONS.some((ext) => name.endsWith(ext))) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('protocolVersion')) return;
      for (const m of line.matchAll(DATE)) {
        if (m[0] < floorIso) {
          problems.push(`${relative(process.cwd(), file)}:${i + 1}: ${m[0]}`);
        }
      }
    });
  }
}

if (problems.length) {
  console.error(
    `Example dates earlier than ${floorIso} (today + ${MIN_DAYS_AHEAD} days). Make the example date-free, ` +
      `compute the date from today, or use a date far in the future:\n  ${problems.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(`example dates ok (none before ${floorIso}) in ${roots.length} path(s)`);
