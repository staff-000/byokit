import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { parseIssueReport } from '../website/verification-report.js';
import { canonicalReport } from '../scripts/verification-report.mjs';
import catalog from '../packages/byokit/catalog.js';
const wait = async (predicate) => {
  for (let n = 0; n < 500; n++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Page state did not arrive.');
};
test('anonymous page verifies, shares safely, fences stale calls and only confirms public evidence', async () => {
  const html = await readFile('website/verification.html', 'utf8'),
    dom = new JSDOM(html, {
      url: 'https://staff-000.github.io/byokit/verification.html',
      pretendToBeVisual: true,
    });
  const originals = {
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
  };
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.localStorage = dom.window.localStorage;
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const $ = (s) => document.querySelector(s),
    change = (id, value) => {
      $('#' + id).value = value;
      $('#' + id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
  let calls = 0,
    feed = [],
    providerMode = 'success',
    resolveProvider,
    resolveInitialFeed;
  let initialFeedPending = true;
  const initialFeed = new Promise((resolve) => (resolveInitialFeed = resolve));
  globalThis.fetch = async (url, options = {}) => {
    if (url === './verification.json')
      return initialFeedPending ? initialFeed : new Response(JSON.stringify({ reports: feed }));
    assert.ok(String(url).startsWith('https://api.deepseek.com/'));
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer fixture-secret-key');
    const data = JSON.parse(options.body);
    assert.ok(
      data.messages[0].content === 'private fixture prompt' ||
        data.messages[0].content === 'Reply with exactly: OK',
    );
    if (providerMode === 'pending') return new Promise((r) => (resolveProvider = r));
    if (providerMode === 'failure') return new Response('{}', { status: 401 });
    return new Response(
      JSON.stringify({
        model: data.model,
        choices: [{ message: { content: 'private generated output' } }],
        usage: { prompt_tokens: 5, completion_tokens: 4 },
      }),
    );
  };
  try {
    let source = await readFile('website/verification.js', 'utf8');
    for (const [relative, file] of [
      ['../packages/byokit/catalog.js', 'packages/byokit/catalog.js'],
      ['./lib/core/catalog.js', 'packages/byokit/catalog.js'],
      ['./verification-report.js', 'website/verification-report.js'],
      ['./contributor-badges.js', 'website/contributor-badges.js'],
      ['./request-examples.js', 'website/request-examples.js'],
      ['./inference.js', 'website/inference.js'],
      ['./verification-filters.js', 'website/verification-filters.js'],
      ['./batch-verification.js', 'website/batch-verification.js'],
    ])
      source = source.replace(`'${relative}'`, JSON.stringify(pathToFileURL(resolve(file)).href));
    await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    assert.equal($('#github-sign-in'), null);
    assert.equal($('#verify').disabled, false);
    assert.equal(calls, 0);
    assert.match($('#verify').textContent, /earn a badge/);
    assert.equal($('#earned-badge').hidden, true);
    for (const id of [
      'model-search',
      'provider-filter',
      'region-filter',
      'exclude-tag-filter',
      'feature-filter',
      'modality-filter',
      'weights-filter',
      'speciality-filter',
      'tier-filter',
      'context-filter',
      'price-filter',
      'sort-filter',
      'include-outdated',
    ])
      assert.ok($('#' + id).closest('thead'), id + ' belongs to the table header');
    assert.equal(document.querySelectorAll('#models tr:first-child td').length, 8);
    change('sort-filter', 'priceDescend');
    const prices = [...document.querySelectorAll('#models tr')].map(
      (tr) => tr.querySelector('td:nth-child(4)')?.textContent,
    );
    assert.ok(prices.length);
    change('sort-filter', 'provider-order');
    change('model-search', 'no-such-model-fixture');
    assert.equal($('#models td').colSpan, 8);
    assert.match($('#models').textContent, /No matching/);
    change('model-search', '');
    const contributor = catalog.verifications[0]?.contributor;
    if (contributor)
      assert.ok($('#contributor-list').textContent.includes(contributor.replace('github:', '@')));
    change('provider-filter', 'deepseek');
    initialFeedPending = false;
    resolveInitialFeed(new Response(JSON.stringify({ reports: [] })));
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (contributor)
      assert.ok(
        $('#contributor-list').textContent.includes(contributor.replace('github:', '@')),
        'filter changes preserve bundled badges while a feed request is canceled',
      );
    $('#models button').click();
    change('api-key', 'fixture-secret-key');
    change('prompt', 'private fixture prompt');
    $('#verify-form').dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await wait(() => !$('#share-verification').hidden);
    assert.equal(calls, 2);
    assert.match($('#call-status').textContent, /Call succeeded/);
    assert.equal($('#earned-badge').hidden, true);
    const share = new URL($('#share-verification').href),
      report = parseIssueReport(share.searchParams.get('body'));
    for (const secret of [
      'fixture-secret-key',
      'private fixture prompt',
      'private generated output',
    ]) {
      assert.ok(!decodeURIComponent(share.href).includes(secret));
      assert.ok(!localStorage.getItem('byokit.inference-verifications.v1').includes(secret));
    }
    $('#share-verification').addEventListener('click', (e) => e.preventDefault());
    $('#share-verification').click();
    await wait(() => $('#publication-status').textContent.includes('Waiting'));
    assert.equal(calls, 2);
    assert.ok(!$('#publication-status').textContent.includes('Published:'));
    feed = [
      canonicalReport({
        report,
        user: { id: 123, login: 'fixture-user' },
        evidence: 'https://github.com/staff-000/byokit/issues/42',
        createdAt: report.checkedAt,
      }),
    ];
    $('#check-publication').click();
    await wait(() => $('#publication-status').textContent.startsWith('Published:'));
    assert.match($('#models').textContent, /Community: verified/);
    assert.match($('#models').textContent, /Community verified by @fixture-user/);
    assert.equal($('#earned-badge').hidden, false);
    assert.match($('#publication-status').textContent, /badge earned/);
    assert.match($('#contributor-list').textContent, /@fixture-user/);
    assert.equal($('#earned-badge-image').getAttribute('src'), './badges/github-123.svg');
    change('verification-filter', 'verified');
    assert.match($('#models').textContent, /Community: verified/);
    change('verification-filter', 'unverified');
    assert.ok(!$('#models').textContent.includes('Community verified by @fixture-user'));
    change('verification-filter', 'any');
    providerMode = 'failure';
    $('#verify-form').dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await wait(() => $('#call-status').textContent.includes('HTTP 401'));
    assert.equal(JSON.parse(localStorage.getItem('byokit.inference-verifications.v1')).length, 1);
    assert.equal($('#share-verification').hidden, true);
    assert.equal($('#earned-badge').hidden, true);
    providerMode = 'pending';
    $('#verify-form').dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await wait(() => resolveProvider);
    change('prompt', 'changed settings');
    resolveProvider(new Response(JSON.stringify({ choices: [{ message: { content: 'late' } }] })));
    await new Promise((r) => setTimeout(r, 30));
    assert.match($('#call-status').textContent, /Settings changed/);
    assert.equal(JSON.parse(localStorage.getItem('byokit.inference-verifications.v1')).length, 1);
    providerMode = 'success';
    change('prompt', 'private fixture prompt');
    assert.equal($('#verified-only'), null);
    assert.ok($('#include-outdated'));
    assert.ok($('#region-filter'));
    assert.ok($('#feature-filter'));
    assert.ok($('#speciality-filter'));
    assert.ok($('#tier-filter'));
    const picks = [...document.querySelectorAll('.batch-pick')].slice(0, 2);
    for (const pick of picks) {
      const current = document.querySelectorAll('.batch-pick')[picks.indexOf(pick)];
      current.checked = true;
      current.dispatchEvent(new dom.window.Event('change'));
    }
    const count = Math.min(2, picks.length),
      before = calls;
    $('#batch-open').click();
    assert.equal($('#batch-confirm').open, true);
    assert.match($('#batch-confirm-description').textContent, new RegExp(`up to ${count} AI`));
    assert.equal(calls, before);
    $('#batch-confirm-cancel').click();
    assert.equal(calls, before);
    $('#batch-open').click();
    $('#batch-confirm-send').click();
    await wait(() => $('#batch-status').textContent.startsWith('Batch finished.'));
    assert.equal(calls, before + count);
    assert.equal(document.querySelectorAll('#batch-results a').length, count);
    for (const link of document.querySelectorAll('#batch-results a'))
      assert.ok(!decodeURIComponent(link.href).includes('fixture-secret-key'));
    const batchShare = document.querySelector('#batch-results a'),
      batchReport = parseIssueReport(new URL(batchShare.href).searchParams.get('body'));
    feed.push(
      canonicalReport({
        report: batchReport,
        user: { id: 123, login: 'fixture-user' },
        evidence: 'https://github.com/staff-000/byokit/issues/43',
        createdAt: batchReport.checkedAt,
      }),
    );
    batchShare.addEventListener('click', (e) => e.preventDefault());
    batchShare.click();
    await wait(() => $('#publication-status').textContent.startsWith('Published:'));
    assert.equal(calls, before + count);

    assert.ok($('#playground'));
    assert.ok($('#cost-estimate'));
    assert.match($('#cost-estimate').textContent, /cents/);
    const row = document.querySelector('#models tr');
    row.click();
    assert.ok(row.classList.contains('selected'));
    assert.match($('#models').textContent, /Verified here/);

    window.dispatchEvent(new dom.window.Event('pagehide'));
    assert.equal($('#api-key').value, '');
  } finally {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
    Object.assign(globalThis, originals);
  }
});
