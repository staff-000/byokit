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

// npm package
const NPM_PACKAGE = {
  name: 'byokit',
  file: 'packages/byokit/package.json',
};

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

function loadEnv() {
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
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {}
      break;
    }
  }
}

loadEnv();

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
  npm run release patch --push          # Publish, push tags, and create GitHub release
  npm run release --github-only         # Create GitHub release for existing tag/version
  npm run release minor --npm-only      # Only publish @byokit/* packages to npm
  npm run release minor --pypi-only     # Only publish byokit to PyPI
  npm run release patch --tag beta      # Publish npm packages under the "beta" tag
  npm run release patch --npm-token ... --pypi-token ... # Pass credentials directly

Options:
  --dry-run             Simulate publish without publishing to npm, PyPI, or pushing git
  --skip-tests          Skip test execution before releasing
  --npm-only            Only publish npm packages (@byokit/core, assets, dom, cli, react)
  --pypi-only           Only publish the Python package to PyPI
  --github-only         Only push tag and create GitHub release (skip npm/PyPI publish)
  --no-github           Skip creating GitHub release
  --npm-token <token>   npm authentication token (or via NPM_TOKEN in env / .env.release)
  --pypi-token <token>  PyPI API token (or via PYPI_API_TOKEN in env / .env.release)
  --tag <tag>           npm dist-tag (default: latest)
  --otp <code>          npm 2FA authentication code
  --pypi-repo <repo>    PyPI repository (default: pypi, e.g. testpypi)
  --no-git              Skip git commit, tag, and GitHub release
  --push                Automatically push git commits and tags to origin, then create GitHub release
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
    githubOnly: false,
    noGithub: false,
    npmToken:
      process.env.GITHUB_ACTIONS && !args.includes('--npm-token')
        ? null
        : process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN || null,
    pypiToken:
      process.env.PYPI_TOKEN || process.env.PYPI_API_TOKEN || process.env.TWINE_PASSWORD || null,
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
    else if (arg === '--github-only') options.githubOnly = true;
    else if (arg === '--no-github') options.noGithub = true;
    else if (arg === '--no-git') options.noGit = true;
    else if (arg === '--push') options.push = true;
    else if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--tag' && args[i + 1]) options.tag = args[++i];
    else if (arg === '--otp' && args[i + 1]) options.otp = args[++i];
    else if (arg === '--pypi-repo' && args[i + 1]) options.pypiRepo = args[++i];
    else if (arg === '--npm-token' && args[i + 1]) options.npmToken = args[++i];
    else if (arg === '--pypi-token' && args[i + 1]) options.pypiToken = args[++i];
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

  // 2. npm package
  const pkgPath = join(rootDir, NPM_PACKAGE.file);
  const data = JSON.parse(readFileSync(pkgPath, 'utf8'));
  data.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ✓ ${NPM_PACKAGE.file} -> ${newVersion}`);

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

function publishNpm({ dryRun, tag, otp, npmToken }) {
  console.log(
    `\n📦 Publishing npm package ${NPM_PACKAGE.name} (tag: ${tag}${dryRun ? ' [dry-run]' : ''})...`,
  );
  const otpFlag = otp ? `--otp ${otp}` : '';
  const dryFlag = dryRun ? '--dry-run' : '';
  const provenanceFlag = process.env.GITHUB_ACTIONS && !dryRun ? '--provenance' : '';

  let tempNpmrc = null;
  const env = {};

  if (npmToken) {
    console.log('ℹ Authenticating to npm using provided token...');
    tempNpmrc = join(rootDir, `.tmp-npmrc-${Date.now()}`);
    writeFileSync(tempNpmrc, `//registry.npmjs.org/:_authToken=${npmToken.trim()}\n`, {
      mode: 0o600,
    });
    env.NPM_CONFIG_USERCONFIG = tempNpmrc;
  } else if (process.env.GITHUB_ACTIONS) {
    console.log(
      'ℹ In GitHub Actions without static token: using npm Trusted Publishing (OIDC / provenance).',
    );
  }

  try {
    console.log(`\n--> Publishing ${NPM_PACKAGE.name}...`);
    const cmd =
      `npm publish --workspace ${NPM_PACKAGE.name} --access public --tag ${tag} ${provenanceFlag} ${otpFlag} ${dryFlag}`
        .replace(/\s+/g, ' ')
        .trim();
    run(cmd, { env });
    console.log(`  ✓ ${NPM_PACKAGE.name} ${dryRun ? '(simulated)' : 'published'}`);
  } finally {
    if (tempNpmrc && existsSync(tempNpmrc)) {
      rmSync(tempNpmrc, { force: true });
    }
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

function publishPypi({ dryRun, repository, pypiToken }) {
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
  const env = {};
  if (pypiToken || process.env.TWINE_PASSWORD) {
    console.log('ℹ Authenticating to PyPI using provided token...');
    env.TWINE_USERNAME = '__token__';
    env.TWINE_PASSWORD = (pypiToken || process.env.TWINE_PASSWORD).trim();
  } else if (process.env.GITHUB_ACTIONS) {
    console.log(
      'ℹ In GitHub Actions without static token: package built in dist/python for PyPI Trusted Publishing.',
    );
    return;
  }

  run(`python3 -m twine upload dist/python/* ${repoFlag}`.trim(), { env });
  console.log(`✅ Uploaded to PyPI repository "${repository}"!`);
}

async function createGitHubRelease(version, { dryRun = false } = {}) {
  const tagName = `v${version}`;
  console.log(`\n🚀 Creating GitHub Release for ${tagName}...`);

  if (dryRun) {
    console.log(`  [dry-run] Would create GitHub release ${tagName}`);
    return;
  }

  // 1. Try gh CLI
  try {
    const hasGh = run('gh --version', { capture: true, silent: true, ignoreError: true });
    if (hasGh) {
      console.log(`$ gh release create ${tagName} --title "Release ${tagName}" --generate-notes`);
      const output = run(
        `gh release create ${tagName} --title "Release ${tagName}" --generate-notes`,
        {
          capture: true,
          ignoreError: true,
        },
      );
      if (output !== null) {
        console.log(`✅ Created GitHub Release ${tagName}!`);
        return;
      }
    }
  } catch (err) {
    if (String(err?.message || '').includes('already exists')) {
      console.log(`ℹ GitHub Release ${tagName} already exists.`);
      return;
    }
    console.warn(`⚠️  gh CLI release creation notice: ${err.message || err}`);
  }

  // 2. Try GitHub REST API via GH_TOKEN or GITHUB_TOKEN
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    try {
      console.log(`ℹ Creating GitHub Release via GitHub REST API...`);
      const repo = process.env.GITHUB_REPOSITORY || 'staff-000/byokit';
      const url = `https://api.github.com/repos/${repo}/releases`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'byokit-release-tool',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tag_name: tagName,
          name: `Release ${tagName}`,
          generate_release_notes: true,
        }),
      });

      if (res.status === 422) {
        const text = await res.text();
        if (text.includes('already_exists')) {
          console.log(`ℹ GitHub Release ${tagName} already exists.`);
          return;
        }
        throw new Error(`HTTP 422: ${text}`);
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const releaseData = await res.json();
      console.log(`✅ Created GitHub Release via API: ${releaseData.html_url}`);
      return;
    } catch (err) {
      console.warn(`⚠️  GitHub REST API release creation notice: ${err.message || err}`);
    }
  }

  console.log(`\nℹ To create or view the release on GitHub:`);
  console.log(`   gh release create ${tagName} --title "Release ${tagName}" --generate-notes`);
  console.log(`   or visit: https://github.com/staff-000/byokit/releases/new?tag=${tagName}\n`);
}

async function handleGit(newVersion, push = false, noGithub = false, dryRun = false) {
  if (dryRun) {
    console.log(`\n🔖 [dry-run] Would create Git commit and tag v${newVersion}`);
    if (push) {
      console.log('⬆ [dry-run] Would push git origin main --tags');
      if (!noGithub) {
        await createGitHubRelease(newVersion, { dryRun: true });
      }
    }
    return;
  }

  console.log(`\n🔖 Creating Git commit and tag v${newVersion}...`);
  run(
    `git add package.json packages/*/package.json packages/python/pyproject.toml catalog/ packages/byokit/catalog.js packages/python/src/byokit/data/`,
  );
  run(`git commit -m "Release v${newVersion}"`);
  run(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  console.log(`✅ Created commit and tag v${newVersion}`);

  if (push) {
    console.log('\n⬆ Pushing to git origin with tags...');
    run('git push origin main --tags');
    console.log('✅ Pushed to origin!');

    if (!noGithub) {
      await createGitHubRelease(newVersion, { dryRun: false });
    }
  } else {
    console.log(`\nℹ To push this release tag to GitHub and publish the GitHub release, run:`);
    console.log(`   git push origin main --tags`);
    if (!noGithub) {
      console.log(
        `   gh release create v${newVersion} --title "Release v${newVersion}" --generate-notes`,
      );
      console.log(
        `   or visit: https://github.com/staff-000/byokit/releases/new?tag=v${newVersion}\n`,
      );
    }
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

  // Pre-flight check: ensure target version is not already published on npm
  if (!options.dryRun && !options.pypiOnly) {
    try {
      const npmVersionsRaw = run(`npm view ${NPM_PACKAGE.name} versions --json`, {
        capture: true,
        silent: true,
        ignoreError: true,
      });
      if (npmVersionsRaw) {
        const npmVersions = JSON.parse(npmVersionsRaw);
        const versionList = Array.isArray(npmVersions) ? npmVersions : [npmVersions];
        if (versionList.includes(newVersion)) {
          console.error(
            `\n❌ Error: Version ${newVersion} has already been published to npm for "${NPM_PACKAGE.name}".`,
          );
          console.error(`Published versions on npm: ${versionList.join(', ')}`);
          console.error(
            `npm versions are immutable. Please specify an unpublished version (e.g. 0.2.0).\n`,
          );
          process.exit(1);
        }
      }
    } catch {}
  }

  // Handle standalone --github-only
  if (options.githubOnly) {
    const versionToRelease = options.target || currentVersion;
    console.log(`Target release version: v${versionToRelease}`);
    const tagName = `v${versionToRelease}`;
    const tagExists = run(`git tag -l ${tagName}`, { capture: true, silent: true })?.trim();
    if (!tagExists) {
      console.log(`Tag ${tagName} does not exist locally. Creating annotated tag ${tagName}...`);
      run(`git tag -a ${tagName} -m "Release ${tagName}"`);
    }
    if ((options.push || !options.noGit) && !options.dryRun) {
      console.log(`\n⬆ Pushing git commits and tags to origin...`);
      run('git push origin main --tags', { ignoreError: true });
    } else if (options.dryRun && (options.push || !options.noGit)) {
      console.log(`\n⬆ [dry-run] Would push git commits and tags to origin`);
    }
    await createGitHubRelease(versionToRelease, { dryRun: options.dryRun });
    console.log(`\n===========================================`);
    console.log(`🎉 GitHub release v${versionToRelease} completed!`);
    console.log(`  - https://github.com/staff-000/byokit/releases/tag/${tagName}`);
    console.log(`===========================================\n`);
    return;
  }

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
        npmToken: options.npmToken,
      });
    }

    // Build and publish Python package
    if (!options.npmOnly) {
      buildPythonPackage({ dryRun: options.dryRun });
      publishPypi({
        dryRun: options.dryRun,
        repository: options.pypiRepo,
        pypiToken: options.pypiToken,
      });
    }

    // Git commit & tag & GitHub release
    if (!options.dryRun && !options.noGit) {
      await handleGit(newVersion, options.push, options.noGithub, false);
    } else if (options.dryRun && !options.noGit && options.push) {
      await handleGit(newVersion, true, options.noGithub, true);
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
      console.log(`npm package:`);
      console.log(`  - https://www.npmjs.com/package/${NPM_PACKAGE.name}`);
    }
    if (!options.npmOnly) {
      console.log(`PyPI package:`);
      console.log(`  - https://pypi.org/project/byokit/${newVersion}/`);
    }
    if (!options.noGithub) {
      console.log(`GitHub release:`);
      console.log(`  - https://github.com/staff-000/byokit/releases/tag/v${newVersion}`);
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
