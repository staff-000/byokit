import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const [source, out] = process.argv.slice(2);
if (!source || !out)
  throw new Error('Usage: node scripts/fetch-assets.mjs catalog.json output-directory');
const catalog = JSON.parse(await readFile(source, 'utf8'));
await mkdir(out, { recursive: true });
const manifest = {};
let downloaded = 0;
let skipped = 0;

const assets = catalog.assets || [];
const concurrency = 10;
let cursor = 0;

async function processAsset(asset) {
  const providerId = asset.id.replace(/^provider:/, '');
  const candidateUrls = [
    new URL(asset.light),
    new URL(
      `https://raw.githubusercontent.com/anomalyco/models.dev/dev/providers/${providerId}/logo.svg`,
    ),
    new URL(
      `https://raw.githubusercontent.com/anomalyco/models.dev/main/providers/${providerId}/logo.svg`,
    ),
  ];
  let text = null;
  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'follow' });
      if (response.ok) {
        const candidateText = await response.text();
        if (candidateText && /<svg\b/i.test(candidateText)) {
          text = candidateText;
          break;
        }
      }
    } catch {}
  }
  if (!text) {
    console.warn(`[WARN] Logo not found for ${asset.id}`);
    skipped++;
    return;
  }
  if (
    text.length > 200000 ||
    !/<svg\b/i.test(text) ||
    /<\s*(script|foreignObject|image|use|iframe|style)\b|\bon\w+\s*=|\b(?:href|src)\s*=|<!|url\s*\(/i.test(
      text,
    )
  ) {
    console.warn(`[WARN] SVG contains unsupported active/external markup for ${asset.id}`);
    skipped++;
    return;
  }
  const name = asset.id.replace(/[^a-zA-Z0-9_-]/g, '_') + '.svg';
  await writeFile(join(resolve(out), name), text);
  manifest[asset.id] = { ...asset, light: name };
  downloaded++;
}

const workers = Array.from({ length: concurrency }, async () => {
  while (cursor < assets.length) {
    const item = assets[cursor++];
    await processAsset(item);
  }
});
await Promise.all(workers);

// Sort keys in manifest for deterministic output
const sortedManifest = {};
for (const k of Object.keys(manifest).sort()) {
  sortedManifest[k] = manifest[k];
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(sortedManifest, null, 2) + '\n');
console.log(`Wrote ${downloaded} local logos to ${out} (${skipped} skipped)`);

// Also sync to packages/byokit/assets if out is 'assets'
if (resolve(out) === resolve('assets')) {
  await mkdir('packages/byokit/assets', { recursive: true });
  await cp(resolve('assets'), resolve('packages/byokit/assets'), { recursive: true });
  console.log(`Synced assets to packages/byokit/assets`);
}
