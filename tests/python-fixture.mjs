import { mkdtempSync, writeFileSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
// File-backed stdin avoids intermittent large duplex-pipe stalls on macOS Node.
export function pythonModels(payload) {
  const directory = mkdtempSync(join(tmpdir(), 'byokit-fixture-')),
    input = join(directory, 'input.json');
  writeFileSync(input, JSON.stringify(payload));
  const fd = openSync(input, 'r');
  try {
    return spawnSync(
      process.env.BYOKIT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
      ['packages/python/tests/conformance_runner.py', 'models'],
      {
        stdio: [fd, 'pipe', 'pipe'],
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30000,
      },
    );
  } finally {
    closeSync(fd);
    rmSync(directory, { recursive: true, force: true });
  }
}
