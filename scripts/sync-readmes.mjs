import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('README.md', root), 'utf8');
for (const path of ['packages/byokit/README.md', 'packages/python/README.md']) {
  if (process.argv.includes('--check')) {
    if ((await readFile(new URL(path, root), 'utf8')) !== source)
      throw new Error(`${path} is stale. Run npm run readme:sync.`);
  } else await writeFile(new URL(path, root), source);
}
console.log(
  process.argv.includes('--check')
    ? 'Package READMEs match the root README.'
    : 'Package READMEs updated from README.md.',
);
