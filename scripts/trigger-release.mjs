#!/usr/bin/env node

/**
 * Script to trigger GitHub Actions release workflow from local machine.
 *
 * Usage:
 *   node scripts/trigger-release.mjs [patch|minor|major|<version>] [--dry-run] [--npm-only] [--pypi-only]
 *   npm run release:trigger
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

// Load .env.release or .env if present
const envFiles = ['.env.release', '.env'];
for (const f of envFiles) {
  const p = join(rootDir, f);
  if (existsSync(p)) {
    try {
      const content = readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    } catch {}
    break;
  }
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('-')) || 'patch';
const isDryRun = args.includes('--dry-run');
const isNpmOnly = args.includes('--npm-only');
const isPypiOnly = args.includes('--pypi-only');

console.log('===========================================');
console.log('🚀 Triggering byokit GitHub Actions Release');
console.log(`Target:    ${target}`);
console.log(`Dry-run:   ${isDryRun}`);
console.log(`Owner/Repo: staff-000/byokit`);
console.log('===========================================');

let triggered = false;

// 1. Try using GitHub CLI (`gh`) if available and logged in
try {
  const ghVersion = execSync('gh --version', { stdio: 'pipe', encoding: 'utf8' });
  if (ghVersion) {
    let cmd = `gh workflow run release.yml -R staff-000/byokit -f target="${target}"`;
    if (isDryRun) cmd += ' -f dry_run=true';
    if (isNpmOnly) cmd += ' -f npm_only=true';
    if (isPypiOnly) cmd += ' -f pypi_only=true';

    console.log(`$ ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
    triggered = true;
    console.log('\n✅ Successfully triggered release workflow via GitHub CLI!');
  }
} catch (err) {
  // gh CLI failed or not logged in, try REST API fallback
}

// 2. Fallback to GitHub REST API using GH_TOKEN or GITHUB_TOKEN
if (!triggered) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    console.log('ℹ Using GitHub Token to trigger via REST API...');
    const url =
      'https://api.github.com/repos/staff-000/byokit/actions/workflows/release.yml/dispatches';
    const payload = JSON.stringify({
      ref: 'main',
      inputs: {
        target,
        dry_run: String(isDryRun),
        npm_only: String(isNpmOnly),
        pypi_only: String(isPypiOnly),
      },
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'byokit-release-trigger',
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    if (res.status === 204) {
      triggered = true;
      console.log('\n✅ Successfully dispatched release workflow via GitHub REST API!');
    } else {
      const body = await res.text();
      console.error(`\n❌ Failed to dispatch workflow (HTTP ${res.status}): ${body}`);
    }
  }
}

if (!triggered) {
  console.log(`
ℹ To trigger the release workflow from your command line:
   1. Authenticate with GitHub CLI:
      gh auth login
   2. Or provide a GitHub token with repo workflow permissions:
      export GH_TOKEN=ghp_your_token_here (or add to .env.release)

Alternatively, trigger it in one click from your browser:
👉 https://github.com/staff-000/byokit/actions/workflows/release.yml
`);
} else {
  console.log('\n👀 View live progress at:');
  console.log('👉 https://github.com/staff-000/byokit/actions/workflows/release.yml\n');
}
