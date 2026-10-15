#!/usr/bin/env node
/**
 * Verification test for published byokit packages on npm and PyPI.
 * Usage: node scripts/test-released-packages.mjs
 */
import assert from 'node:assert/strict';

console.log('🔍 Testing published byokit packages on npm and PyPI...\n');

// 1. Test npm package registry
console.log('1️⃣ Checking npm registry (https://registry.npmjs.org/byokit)...');
const npmRes = await fetch('https://registry.npmjs.org/byokit', {
  headers: { Accept: 'application/json' },
});
assert.equal(npmRes.status, 200, `npm package not found (status ${npmRes.status})`);
const npmData = await npmRes.json();
assert.equal(npmData.name, 'byokit', `Expected name byokit, got ${npmData.name}`);
const npmLatest = npmData['dist-tags']?.latest;
assert.ok(npmLatest, 'npm latest tag missing');
console.log(`  ✓ npm package: byokit@${npmLatest}`);
console.log(`  ✓ Published versions: ${Object.keys(npmData.versions).join(', ')}`);
console.log(`  ✓ Description: "${npmData.description}"`);
console.log(`  ✓ Homepage: ${npmData.homepage}`);

// 2. Test PyPI package registry
console.log('\n2️⃣ Checking PyPI registry (https://pypi.org/pypi/byokit/json)...');
const pypiRes = await fetch('https://pypi.org/pypi/byokit/json', {
  headers: { Accept: 'application/json' },
});
assert.equal(pypiRes.status, 200, `PyPI package not found (status ${pypiRes.status})`);
const pypiData = await pypiRes.json();
assert.equal(pypiData.info.name, 'byokit', `Expected name byokit, got ${pypiData.info.name}`);
const pypiLatest = pypiData.info.version;
assert.ok(pypiLatest, 'PyPI latest version missing');
console.log(`  ✓ PyPI package: byokit ${pypiLatest}`);
console.log(`  ✓ Available versions: ${Object.keys(pypiData.releases).join(', ')}`);
console.log(`  ✓ Summary: "${pypiData.info.summary}"`);
console.log(`  ✓ License: ${pypiData.info.license}`);

console.log('\n🎉 Both packages are verified and live on npm and PyPI registries!');
