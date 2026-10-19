import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
function releaseScript(name) {
  const block = workflow.split(`      - name: ${name}\n`)[1].split('\n      - name:')[0];
  const source = block
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  assert.ok(
    !source.includes('${{'),
    'untrusted workflow expressions must not be embedded in shell source',
  );
  return source;
}

test(
  'release workflow treats targets and tags as data and never executes input shell substitutions',
  { skip: process.platform === 'win32' },
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'byokit-release-security-'));
    const marker = join(directory, 'unexpected-execution');
    writeFileSync(join(directory, 'node'), '#!/bin/bash\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
    const run = (script, env) =>
      spawnSync('bash', ['-e', '-c', script], {
        env: {
          PATH: `${directory}:/usr/bin:/bin`,
          RELEASE_TARGET: '',
          RELEASE_TAG: '',
          RELEASE_DRY_RUN: 'false',
          RELEASE_NPM_ONLY: 'false',
          RELEASE_PYPI_ONLY: 'false',
          ...env,
        },
        encoding: 'utf8',
      });
    try {
      const manual = releaseScript('Run release script (Manual Dispatch)');
      const published = releaseScript('Run release script (GitHub Release Published)');
      for (const target of ['patch', 'minor', 'major', '1.2.3', '1.2.3-beta.1']) {
        const result = run(manual, {
          RELEASE_TARGET: target,
          RELEASE_DRY_RUN: 'true',
          RELEASE_NPM_ONLY: 'true',
          RELEASE_PYPI_ONLY: 'false',
        });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(result.stdout.trim().split('\n'), [
          'scripts/release.mjs',
          target,
          '--dry-run',
          '--npm-only',
        ]);
      }
      const pushed = run(manual, {
        RELEASE_TARGET: 'patch',
        RELEASE_DRY_RUN: 'false',
        RELEASE_PYPI_ONLY: 'true',
      });
      assert.deepEqual(pushed.stdout.trim().split('\n'), [
        'scripts/release.mjs',
        'patch',
        '--push',
        '--pypi-only',
      ]);
      const tagged = run(published, { RELEASE_TAG: 'v1.2.3-beta.1' });
      assert.equal(tagged.status, 0, tagged.stderr);
      assert.deepEqual(tagged.stdout.trim().split('\n'), [
        'scripts/release.mjs',
        '1.2.3-beta.1',
        '--no-git',
      ]);
      for (const malicious of [
        `$(touch ${marker})`,
        `1.2.3; touch ${marker}`,
        'patch --push',
        '1.2.3\n--push',
        '`id`',
        '-h',
      ]) {
        assert.notEqual(run(manual, { RELEASE_TARGET: malicious }).status, 0);
        assert.notEqual(run(published, { RELEASE_TAG: malicious }).status, 0);
        assert.equal(existsSync(marker), false);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
