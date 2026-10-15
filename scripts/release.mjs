#!/usr/bin/env node

/**
 * byokit multi-package release script
 * Releases packages to npm and PyPI with version bumping, pre-flight checks,
 * and Git tagging.
 *
 * Usage:
 *   node scripts/release.mjs [patch|minor|major|<version>] [options]
 *
 * Options:
 *   --dry-run          Simulate publication without modifying registries or git tags
 *   --skip-tests       Skip pre-flight test suites
 *   --npm-only         Only release npm packages (@byokit/*)
 *   --pypi-only        Only release Python package (byokit)
 *   --tag <tag>        npm dist-tag (default: latest)
 *   --otp <code>       npm 2FA one-time code
 *   --pypi-repo <repo> PyPI repository (default: pypi, e.g. testpypi)
 *   --no-git           Skip git commit and tag creation
 *   --push             Automatically push git commit and tag to origin
 *   --allow-dirty      Allow uncommitted working tree changes
 *   --help, -h         Show help menu
 */

import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');

// npm packages in topological dependency order
const NPM_PACKAGES = [
  { name: '@byokit/core', file: 'packages/core/package.json' },
  { name: '@byokit/assets', file: 'packages/assets/package.json' },
  { name: '@byokit/dom', file: 'packages/dom/package.json', deps: ['@byokit/core'] },
  { name: '@byokit/cli', file: 'packages/cli/package.json', deps: ['@byokit/core'] },
  { name: '@byokit/react', file: 'packages/react/package.json', deps: ['@byokit/dom'] },
];

const PYTHON_PACKAGE = {
  name: 'byokit',
  dir: 'packages/python',
  toml: 'packages/python/pyproject.toml',
};

function run(cmd, opts = {}) {
  const silent = opts.silent ?? false;
  if (!silent) console.log(`$ ${cmd}`);
  try {
    return execSync(cmd, {
      cwd: rootDir,
      stdio: opts.capture ? 'pipe' : silent ? 'ignore' : 'inherit',
      encoding: 'utf8',
      env: { ...process.env, ...opts.env },
    });
  } catch (err) {
    if (opts.ignoreError) return null;
    throw err;
  }
}

function parseSemver(v) {
  const match = String(v)
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || null,
  };
}

function bumpVersion(current, type) {
  const parsed = parseSemver(current);
  if (!parsed) throw new Error(`Invalid current version: ${current}`);
  const { major, minor, patch } = parsed;
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (parseSemver(type)) return type;
  throw new Error(
    `Unknown bump type or invalid version: "${type}". Expected patch, minor, major, or X.Y.Z.`,
  );
}

function printHelp() {
  console.log(`
byokit Release Tool

Usage:
  npm run release [patch | minor | major | <version>] [options]

Examples:
  npm run release patch                 # Bump 0.1.0 -> 0.1.1, test, and release
  npm run release minor                 # Bump 0.1.0 -> 0.2.0, test, and release
  npm run release 1.0.0                 # Set version 1.0.0 and release
  npm run release patch --dry-run       # Test and simulate release without publishing
  npm run release minor --npm-only      # Only publish @byokit/* packages to npm
  npm run release minor --pypi-only     # Only publish byokit to PyPI
  npm run release patch --tag beta      # Publish npm packages under the "beta" tag

Options:
  --dry-run             Simulate publish without publishing to npm, PyPI, or pushing git
  --skip-tests          Skip test execution before releasing
  --npm-only            Only publish npm packages (@byokit/core, assets, dom, cli, react)
  --pypi-only           Only publish the Python package to PyPI
  --tag <tag>           npm dist-tag (default: latest)
  --otp <code>          npm 2FA authentication code
  --pypi-repo <repo>    PyPI repository (default: pypi, e.g. testpypi)
  --no-git              Skip git commit and tag
  --push                Automatically push git commits and tags to origin
  --allow-dirty         Allow release with uncommitted changes
  --help, -h            Show this help message
`);
}

function parseCliArgs(args) {
  const options = {
    target: null,
    dryRun: false,
    skipTests: false,
    npmOnly: false,
    pypiOnly: false,
    tag: 'latest',
    otp: null,
    pypiRepo: 'pypi',
    noGit: false,
    push: false,
    allowDirty: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-tests') options.skipTests = true;
    else if (arg === '--npm-only') options.npmOnly = true;
    else if (arg === '--pypi-only') options.pypiOnly = true;
    else if (arg === '--no-git') options.noGit = true;
    else if (arg === '--push') options.push = true;
    else if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--tag' && args[i + 1]) options.tag = args[++i];
    else if (arg === '--otp' && args[i + 1]) options.otp = args[++i];
    else if (arg === '--pypi-repo' && args[i + 1]) options.pypiRepo = args[++i];
    else if (!arg.startsWith('-') && !options.target) options.target = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function updateManifests(newVersion) {
  console.log(`\n📝 Updating manifests to version ${newVersion}...`);

  // 1. Root package.json
  const rootPath = join(rootDir, 'package.json');
  const rootPkg = JSON.parse(readFileSync(rootPath, 'utf8'));
  rootPkg.version = newVersion;
  writeFileSync(rootPath, JSON.stringify(rootPkg, null, 2) + '\n');
  console.log(`  ✓ package.json -> ${newVersion}`);

  // 2. npm packages
  for (const pkg of NPM_PACKAGES) {
    const pkgPath = join(rootDir, pkg.file);
    const data = JSON.parse(readFileSync(pkgPath, 'utf8'));
    data.version = newVersion;
    if (pkg.deps) {
      for (const dep of pkg.deps) {
        if (data.dependencies?.[dep]) {
          data.dependencies[dep] = newVersion;
        }
      }
    }
    writeFileSync(pkgPath, JSON.stringify(data, null, 2) + '\n');
    console.log(`  ✓ ${pkg.file} -> ${newVersion}`);
  }

  // 3. Python pyproject.toml
  const tomlPath = join(rootDir, PYTHON_PACKAGE.toml);
  let tomlContent = readFileSync(tomlPath, 'utf8');
  tomlContent = tomlContent.replace(/^version\s*=\s*".*"/m, `version = "${newVersion}"`);
  writeFileSync(tomlPath, tomlContent);
  console.log(`  ✓ ${PYTHON_PACKAGE.toml} -> ${newVersion}`);
}

function runPreflightTests() {
  console.log('\n🧪 Running test and lint suites...');
  run('npm run lint');
  run('npm test');
  run('npm run test:python');
  run('npm run typecheck');
  run('npm run typecheck:python');
  run('npm run check:budget');
  console.log('✅ All checks passed successfully.');
}

function publishNpm({ dryRun, tag, otp }) {
  console.log(`\n📦 Publishing npm packages (tag: ${tag}${dryRun ? ' [dry-run]' : ''})...`);
  const otpFlag = otp ? `--otp ${otp}` : '';
  const dryFlag = dryRun ? '--dry-run' : '';

  for (const pkg of NPM_PACKAGES) {
    console.log(`\n--> Publishing ${pkg.name}...`);
    const cmd =
      `npm publish --workspace ${pkg.name} --access public --tag ${tag} ${otpFlag} ${dryFlag}`
        .replace(/\s+/g, ' ')
        .trim();
    run(cmd);
    console.log(`  ✓ ${pkg.name} ${dryRun ? '(simulated)' : 'published'}`);
  }
}

function buildPythonPackage({ dryRun = false } = {}) {
  console.log('\n🐍 Building Python sdist and wheel...');
  const outDir = join(rootDir, 'dist/python');

  let hasBuild = false;
  try {
    run('python3 -m build --version', { capture: true, silent: true });
    hasBuild = true;
  } catch {}

  if (hasBuild) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    run('python3 -m build packages/python --outdir dist/python');
    const files = readdirSync(outDir);
    console.log('✅ Built Python distribution files in dist/python:');
    for (const f of files) console.log(`   - ${f}`);
    return;
  }

  if (dryRun) {
    console.log('ℹ [DRY-RUN] "build" module not found in environment.');
    console.log(
      'ℹ [DRY-RUN] In release environment, would run: python3 -m pip install build twine && python3 -m build packages/python --outdir dist/python',
    );
    return;
  }

  // Live release: attempt pip installation of build tool
  try {
    console.log('ℹ "build" module not found. Installing build tool via pip...');
    run('python3 -m pip install --quiet --upgrade build');
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    run('python3 -m build packages/python --outdir dist/python');
    const files = readdirSync(outDir);
    console.log('✅ Built Python distribution files in dist/python:');
    for (const f of files) console.log(`   - ${f}`);
  } catch {
    throw new Error(
      'Failed to build Python package. Please ensure "build" is installed (pip install build twine).',
    );
  }
}

function publishPypi({ dryRun, repository }) {
  console.log(
    `\n🚀 Uploading Python package to PyPI (${repository}${dryRun ? ' [dry-run]' : ''})...`,
  );
  const distDir = join(rootDir, 'dist/python');

  if (dryRun) {
    const repoFlag = repository === 'pypi' ? '' : ` --repository ${repository}`;
    console.log(`ℹ [DRY-RUN] Would run: python3 -m twine upload dist/python/*${repoFlag}`);
    return;
  }

  if (!existsSync(distDir) || readdirSync(distDir).length === 0) {
    throw new Error('No Python distribution files found in dist/python. Run build first.');
  }

  let hasTwine = false;
  try {
    run('python3 -m twine --version', { capture: true, silent: true });
    hasTwine = true;
  } catch {}

  if (!hasTwine) {
    try {
      console.log('ℹ "twine" module not found. Installing twine via pip...');
      run('python3 -m pip install --quiet --upgrade twine');
      hasTwine = true;
    } catch {
      throw new Error('Twine is not installed. Please run: pip install twine');
    }
  }

  const repoFlag = repository === 'pypi' ? '' : `--repository ${repository}`;
  run(`python3 -m twine upload dist/python/* ${repoFlag}`.trim());
  console.log(`✅ Uploaded to PyPI repository "${repository}"!`);
}

function handleGit(newVersion, push = false) {
  console.log(`\n🔖 Creating Git commit and tag v${newVersion}...`);
  run(`git add package.json packages/*/package.json packages/python/pyproject.toml`);
  run(`git commit -m "Release v${newVersion}"`);
  run(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  console.log(`✅ Created commit and tag v${newVersion}`);

  if (push) {
    console.log('\n⬆ Pushing to git origin with tags...');
    run('git push origin main --tags');
    console.log('✅ Pushed to origin!');
  } else {
    console.log(`\nℹ To push this release tag to GitHub, run:\n   git push origin main --tags\n`);
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  const currentVersion = rootPkg.version;
  console.log(`===========================================`);
  console.log(`📦 byokit release tool`);
  console.log(`Current version: ${currentVersion}`);
  console.log(`Mode:            ${options.dryRun ? 'DRY-RUN (Simulation)' : 'LIVE RELEASE'}`);
  console.log(`===========================================`);

  // Target version calculation
  const targetInput = options.target || 'patch';
  const newVersion = bumpVersion(currentVersion, targetInput);
  console.log(`Target version:  ${newVersion}`);

  // Git cleanliness check
  if (!options.allowDirty && !options.dryRun) {
    const gitStatus = run('git status --porcelain', { capture: true, silent: true })?.trim();
    if (gitStatus) {
      console.error('\n❌ Git working directory is not clean:');
      console.error(gitStatus);
      console.error('\nPlease commit or stash changes before releasing, or pass --allow-dirty.');
      process.exit(1);
    }
  }

  // Pre-flight tests
  if (!options.skipTests) {
    runPreflightTests();
  }

  // Update versions in files
  updateManifests(newVersion);

  try {
    // Publish npm packages
    if (!options.pypiOnly) {
      publishNpm({
        dryRun: options.dryRun,
        tag: options.tag,
        otp: options.otp,
      });
    }

    // Build and publish Python package
    if (!options.npmOnly) {
      buildPythonPackage({ dryRun: options.dryRun });
      publishPypi({
        dryRun: options.dryRun,
        repository: options.pypiRepo,
      });
    }

    // Git commit & tag
    if (!options.dryRun && !options.noGit) {
      handleGit(newVersion, options.push);
    }

    if (options.dryRun) {
      console.log('\nRestoring original version in manifests (dry-run cleanup)...');
      updateManifests(currentVersion);
    }

    console.log(`\n===========================================`);
    console.log(
      `🎉 Release v${newVersion} ${options.dryRun ? 'dry-run completed successfully!' : 'completed successfully!'}`,
    );
    if (!options.pypiOnly) {
      console.log(`npm packages:`);
      for (const p of NPM_PACKAGES) console.log(`  - https://www.npmjs.com/package/${p.name}`);
    }
    if (!options.npmOnly) {
      console.log(`PyPI package:`);
      console.log(`  - https://pypi.org/project/byokit/${newVersion}/`);
    }
    console.log(`===========================================\n`);
  } catch (err) {
    if (options.dryRun) {
      // Revert version modifications in dry-run mode
      console.log('\nRestoring original version in manifests...');
      updateManifests(currentVersion);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error('\n❌ Release failed:', err.message || err);
  process.exit(1);
});
