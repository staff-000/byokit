import { localSetupSmoke } from './local-setup-browser-smoke.mjs';
import { playgroundSmoke, playgroundVerificationSmoke } from './playground-browser-smoke.mjs';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.BYOKIT_SITE_URL || 'http://127.0.0.1:4174/byokit/';
const browser = await chromium.launch({
  executablePath:
    process.env.BYOKIT_CHROME ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : '/usr/bin/google-chrome'),
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
    errors = [],
    failed = [],
    moduleURLs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().startsWith(base) && new URL(r.url()).pathname.endsWith('.js'))
      moduleURLs.push(r.url());
    if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.url());
  });
  await page.goto(base);
  const assetVersion = new URL(
    await page.locator('script[src]').first().getAttribute('src'),
    base,
  ).searchParams.get('v');
  assert.match(assetVersion, /^[a-f0-9]{16}$/);
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await page.locator('#results tr').first().waitFor();
  assert.ok((await page.locator('#hero-code').textContent()).includes('byokit.call'));
  assert.ok(
    (await page.locator('#hero-code').textContent()).includes('sort: byokit.ModelSort.PriceAscend'),
  );
  assert.ok((await page.locator('#hero-providers').textContent()).includes('Anthropic'));
  assert.equal(await page.locator('#results tr').count(), 7);
  await page.locator('#output').selectOption('video');
  assert.ok(
    (await page
      .getByRole('button', { name: 'Complete', exact: true })
      .getAttribute('aria-pressed')) === 'true',
  );
  assert.ok((await page.locator('#query').textContent()).includes('Modality.Video'));
  assert.ok((await page.locator('#results tr').count()) > 0);
  assert.ok(!(await page.locator('#results').textContent()).includes('LOCAL SETUP'));
  await page.locator('#output').selectOption('');
  await page.getByRole('button', { name: 'Default', exact: true }).click();
  assert.equal(await page.locator('#results tr').count(), 7);
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  assert.equal(await page.locator('#results tr').count(), 12);
  await page.locator('#more').click();
  assert.equal(await page.locator('#results tr').count(), 36);
  await page.getByRole('button', { name: 'China', exact: true }).click();
  assert.ok((await page.locator('#results').textContent()).includes('DeepSeek'));
  assert.ok(!(await page.locator('#results').textContent()).includes('OpenAI'));
  await page.locator('#local').uncheck();
  assert.equal(await page.locator('#results tr').count(), 3);
  await page.locator('#search').fill('no-such-model');
  assert.ok((await page.locator('#results').textContent()).includes('No matching'));
  await page.locator('#search').fill('');
  await page.getByRole('button', { name: 'Global', exact: true }).click();
  await page.locator('#tools').check();
  await page.locator('#premium').check();
  assert.ok((await page.locator('#query').textContent()).includes('byokit.Tag.PricePremium'));
  await page.getByRole('button', { name: 'Python', exact: true }).click();
  assert.ok((await page.locator('#start-code').textContent()).includes('byokit.get_models'));
  await page.locator('[data-example="inference"]').click();
  assert.ok((await page.locator('#start-code').textContent()).includes('DEEPSEEK_API_KEY'));
  assert.ok((await page.locator('#start-code').textContent()).includes('byokit.OpenAI('));
  assert.ok(
    (await page.locator('#start-code').textContent()).includes('client.chat.completions.create('),
  );
  assert.ok(
    (await page.locator('#expected-return').textContent()).includes('actual model output varies'),
  );
  await page.getByRole('button', { name: 'JavaScript / TS', exact: true }).click();
  assert.ok(
    (await page.locator('#start-code').textContent()).includes('client.chat.completions.create('),
  );
  await page.getByRole('button', { name: 'Claude format', exact: true }).click();
  assert.ok((await page.locator('#start-code').textContent()).includes('client.messages.create('));
  assert.ok((await page.locator('#expected-return').textContent()).includes('type:'));
  await page.getByRole('button', { name: 'OpenAI format', exact: true }).click();
  await page.locator('[data-example="direct"]').click();
  assert.ok((await page.locator('#start-code').textContent()).includes('byokit.call(model,'));
  assert.ok((await page.locator('#start-code').textContent()).includes('Set DEEPSEEK_API_KEY'));
  assert.equal(
    await page.getByRole('button', { name: 'Claude format', exact: true }).isVisible(),
    false,
  );
  await page.locator('[data-example="local"]').click();
  assert.ok((await page.locator('#start-code').textContent()).includes('byokit.LocalApi.Ollama'));
  await page.getByRole('button', { name: 'Python', exact: true }).click();
  assert.ok((await page.locator('#start-code').textContent()).includes('byokit.LocalApi.OLLAMA'));
  assert.ok((await page.locator('#example-note').textContent()).includes('running server'));
  await page.getByRole('button', { name: 'JavaScript / TS', exact: true }).click();
  await page.locator('[data-example="direct"]').click();
  assert.match(await page.locator('#integration-contract').textContent(), /connection.protocol/);
  assert.match(await page.locator('#integration-contract').textContent(), /providerId/);
  await playgroundSmoke(page);
  await playgroundVerificationSmoke(page);
  await page
    .locator('#api-examples')
    .screenshot({ path: join(tmpdir(), 'byokit-api-examples-desktop.png') });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: join(tmpdir(), 'byokit-site-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page
    .locator('#api-examples')
    .screenshot({ path: join(tmpdir(), 'byokit-api-examples-mobile.png') });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: join(tmpdir(), 'byokit-site-mobile.png'), fullPage: true });
  await page.goto(base + 'verification.html');
  assert.equal(await page.locator('#verify').isDisabled(), false);
  assert.match(await page.locator('#verify').textContent(), /Test speed|Add your speed result/);
  assert.equal(await page.locator('#github-sign-in').count(), 0);
  await page.locator('#models tr').first().waitFor();
  assert.equal(await page.locator('#callable-filter').isChecked(), true);
  assert.equal(await page.locator('#provider-filter option[value="302ai"]').count(), 1);
  assert.equal(await page.locator('#provider-filter option[value="local"]').count(), 0);
  assert.equal(await page.locator('#models .batch-pick:disabled').count(), 0);
  await page.locator('#provider-filter').selectOption('302ai');
  assert.match(await page.locator('#models').textContent(), /No matching/);
  await page.locator('#callable-filter').uncheck();
  assert.ok((await page.locator('#models .batch-pick:disabled').count()) > 0);
  assert.match(await page.locator('#models').textContent(), /No reviewed provider adapter/);
  await page.locator('#callable-filter').check();
  assert.match(await page.locator('#models').textContent(), /No matching/);
  await page.locator('#provider-filter').selectOption('');
  await page.locator('#setup-local').click();
  assert.equal(await page.locator('#local-setup').isVisible(), true);
  assert.equal(await page.locator('#verification-drawer').isVisible(), false);
  await page.locator('#local-setup-model').fill('fixture-local');
  await page.getByRole('button', { name: 'Use this model', exact: true }).click();
  assert.equal(await page.locator('#local-configured').isVisible(), true);
  await page.locator('#local-verify').click();
  assert.equal(await page.locator('#verification-drawer').isVisible(), true);
  assert.match(await page.locator('#selected-name').textContent(), /fixture-local/);
  await page.locator('#drawer-close').click();
  assert.equal(await page.locator('#verified-only').count(), 0);
  assert.equal(await page.locator('#include-outdated').count(), 1);
  assert.equal(await page.locator('#feature-filter').count(), 1);
  assert.equal(await page.locator('.verification-models thead select').count(), 12);
  assert.equal(await page.locator('.verification-models thead #include-outdated').count(), 1);
  assert.equal(await page.locator('#models tr').first().locator('td').count(), 8);
  await page.locator('#sort-filter').selectOption('priceDescend');
  assert.ok((await page.locator('#models tr').first().textContent()).includes('Input $'));
  await page.locator('#sort-filter').selectOption('provider-order');
  assert.ok(await page.locator('#provider-filter').isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok((await page.locator('#model-count').textContent()).match(/\d+/)?.[0] > 500);
  assert.ok((await page.locator('#models').textContent()).includes('lifecycle:UNCERTAIN'));
  assert.ok(!(await page.locator('body').textContent()).includes('unit test'));
  await page.locator('#provider-filter').selectOption('deepseek');
  await page.locator('#models button').first().scrollIntoViewIfNeeded();
  const tableScroll = await page.evaluate(() => scrollY);
  await page.locator('#models button').first().click();
  assert.ok(Math.abs((await page.evaluate(() => scrollY)) - tableScroll) < 3);
  assert.equal(await page.locator('#verification-drawer').isVisible(), true);
  assert.equal(
    await page.locator('#selected-name').evaluate((el) => getComputedStyle(el).fontSize),
    '20px',
  );
  await page.locator('#verification-drawer').screenshot({
    path: join(tmpdir(), 'byokit-drawer-single.png'),
  });
  await page.locator('#drawer-close').click();
  assert.equal(
    await page
      .locator('#models button')
      .first()
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.ok(Math.abs((await page.evaluate(() => scrollY)) - tableScroll) < 3);
  await page.locator('#models button').first().press('Enter');
  assert.equal(await page.locator('#verification-drawer').isVisible(), true);
  let calls = 0;
  await page.route('https://api.deepseek.com/**', async (route) => {
    calls++;
    assert.equal(route.request().headers().authorization, 'Bearer dummy-browser-key');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'deepseek-flash',
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 6, completion_tokens: 1 },
      }),
    });
  });
  await page.locator('#api-key').fill('dummy-browser-key');
  await page.locator('#request-example summary').click();
  assert.ok(!(await page.locator('#request-code').textContent()).includes('dummy-browser-key'));
  await page.getByRole('button', { name: 'cURL', exact: true }).click();
  assert.ok((await page.locator('#request-code').textContent()).includes('$API_KEY'));
  assert.equal(calls, 0);
  await page.locator('#verify').click();
  await page.getByText(/Call succeeded (?:in|for text generation)/).waitFor();
  // Single-model verification uses a baseline request plus its speed benchmark.
  assert.equal(calls, 2);
  assert.equal(await page.locator('#share-verification').isVisible(), true);
  assert.equal(await page.locator('#earned-badge').isVisible(), false);
  const share = new URL(await page.locator('#share-verification').getAttribute('href'));
  const issueText = share.searchParams.get('body');
  assert.ok(!issueText.includes('dummy-browser-key'));
  assert.ok(!issueText.includes('Reply with exactly'));
  const report = JSON.parse(issueText.match(/```json\s*\n([\s\S]*?)\n```/)[1]);
  await page.evaluate(() =>
    document
      .querySelector('#share-verification')
      .addEventListener('click', (event) => event.preventDefault(), { once: true }),
  );
  await page.locator('#share-verification').click();
  await page
    .getByText('Submit the issue on GitHub. Waiting for it to appear on the website…', {
      exact: true,
    })
    .waitFor();
  // Single-model verification uses a baseline request plus its speed benchmark.
  assert.equal(calls, 2);
  await page.route('**/badges/github-1.svg', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="48"><text x="10" y="30">Fixture Model Verifier</text></svg>',
    }),
  );
  await page.route('**/verification.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reports: [
          {
            id: 'website:1:' + report.operationId,
            offeringId: report.offeringId,
            contributor: 'github:fixture-user',
            checkedAt: report.checkedAt,
            result: 'passed',
            checks: ['textGeneration'],
            adapter: 'byokit-website@count-128-delta-v1:chat',
            tokensPerSecond: 68,
            evidence: 'https://github.com/staff-000/byokit/issues/1',
          },
        ],
      }),
    }),
  );
  await page.locator('#check-publication').click();
  await page.getByText(/Published: community verified by @fixture-user/).waitFor();
  assert.equal(await page.locator('#earned-badge').isVisible(), true);
  assert.ok((await page.locator('#contributor-list').textContent()).includes('@fixture-user'));
  assert.match(await page.locator('#models').textContent(), /Median · 1 standard measurement/);
  assert.match(await page.locator('#models').textContent(), /Small sample · provisional estimate/);
  assert.ok(await page.getByRole('button', { name: 'Add your speed result', exact: true }).count());
  // Single-model verification uses a baseline request plus its speed benchmark.
  assert.equal(calls, 2);
  const stored = await page.evaluate(() =>
    localStorage.getItem('byokit.inference-verifications.v1'),
  );
  assert.ok(stored && !stored.includes('dummy-browser-key'));
  assert.ok(!stored.includes('dummy-session'));
  assert.ok(!stored.includes('Reply with exactly'));
  await page.reload();
  await page.locator('#models tr').first().waitFor();
  assert.equal(await page.locator('#api-key').inputValue(), '');
  assert.equal(await page.locator('#verify').isDisabled(), false);
  assert.ok((await page.locator('#records').textContent()).includes(report.offeringId));
  await page.locator('#provider-filter').selectOption('deepseek');
  await page.locator('#models button').first().click();
  await page.locator('#api-key').fill('another-dummy-key');
  await page.route('https://api.deepseek.com/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
  );
  await page.locator('#verify').click();
  await page
    .locator('#call-status')
    .filter({ hasText: /HTTP 401/ })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('byokit.inference-verifications.v1')).length,
    ),
    2,
  );
  let quotaCalls = 0;
  await page.route('https://api.deepseek.com/**', (route) => {
    quotaCalls++;
    return route.fulfill({
      status: 429,
      headers: { 'Retry-After': '1', 'Access-Control-Expose-Headers': 'Retry-After' },
      contentType: 'application/json',
      body: JSON.stringify({
        error: { type: 'insufficient_quota', message: 'private provider account information' },
      }),
    });
  });
  await page.locator('#verify').click();
  await page
    .locator('#call-status')
    .filter({ hasText: /quota is exhausted/ })
    .waitFor();
  assert.match(await page.locator('#attempt-community').textContent(), /successful calls reported/);
  await page
    .locator('#retry-guidance')
    .filter({ hasText: /wait has elapsed/ })
    .waitFor();
  assert.equal(quotaCalls, 1, 'retry guidance never sends another request');
  const failureShare = new URL(await page.locator('#share-verification').getAttribute('href'));
  const failureBody = failureShare.searchParams.get('body');
  assert.ok(!failureBody.includes('private provider account information'));
  const failureReport = JSON.parse(failureBody.match(/```json\s*\n([\s\S]*?)\n```/)[1]);
  assert.equal(failureReport.assessment.attempt.reason, 'quota_exhausted');
  assert.equal(failureReport.assessment.attempt.scope, 'account');
  let batchCalls = 0;
  await page.route('https://api.deepseek.com/**', async (route) => {
    batchCalls++;
    const body = JSON.parse(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: body.model,
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 6, completion_tokens: 1 },
      }),
    });
  });
  await page.locator('#drawer-close').click();
  const batchCount = Math.min(2, await page.locator('.batch-pick').count());
  for (let i = 0; i < batchCount; i++) await page.locator('.batch-pick').nth(i).check();
  await page.locator('#batch-open').click();
  assert.ok(
    (await page.locator('#batch-confirm-description').textContent()).includes(
      `up to ${batchCount} AI`,
    ),
  );
  assert.equal(batchCalls, 0);
  await page.locator('#batch-confirm-cancel').click();
  assert.equal(batchCalls, 0);
  await page.locator('#batch-open').click();
  await page.locator('#batch-confirm-send').click();
  await page
    .locator('#batch-status')
    .filter({ hasText: /Batch finished\./ })
    .waitFor();
  assert.equal(batchCalls, batchCount);
  assert.equal(await page.locator('#batch-results a').count(), 0);
  assert.equal(await page.locator('#batch-share-actions').isVisible(), true);
  const batchHref = await page.locator('#batch-share').getAttribute('href');
  assert.match(batchHref, /github.com/);
  assert.ok(!decodeURIComponent(batchHref).includes('another-dummy-key'));
  await page.locator('#drawer-close').click();
  await page.locator('#models button').first().click();
  await page.locator('#clear-key').click();
  assert.equal(await page.locator('#api-key').inputValue(), '');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#drawer-close').click();
  await page.locator('#batch-clear').click();
  await page.locator('.batch-pick:not(:disabled)').first().check();
  await page.locator('#provider-filter').selectOption('openai');
  await page.locator('.batch-pick:not(:disabled)').first().check();
  assert.match(await page.locator('#batch-count').textContent(), /2 models selected/);
  await page.locator('#model-search').fill('no-match-fixture');
  assert.match(await page.locator('#batch-count').textContent(), /2 models selected/);
  await page.locator('#model-search').fill('');
  await page.locator('#batch-open').click();
  assert.equal(await page.locator('#batch-keys input').count(), 2);
  assert.equal(
    await page.locator('#batch-confirm-title').evaluate((el) => getComputedStyle(el).fontSize),
    '20px',
  );
  assert.ok(
    await page.locator('#verification-drawer').evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
  await page.locator('#verification-drawer').screenshot({
    path: join(tmpdir(), 'byokit-drawer-batch.png'),
  });
  await page.locator('#batch-keys [data-provider="deepseek"]').fill('deep-batch-key');
  await page.locator('#batch-keys [data-provider="openai"]').fill('open-batch-key');
  let releaseBatch,
    mixedCalls = 0;
  const gate = new Promise((resolve) => {
    releaseBatch = resolve;
  });
  await page.route('https://api.deepseek.com/**', async (route) => {
    mixedCalls++;
    assert.equal(route.request().headers().authorization, 'Bearer deep-batch-key');
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
    });
  });
  await page.route('https://api.openai.com/**', async (route) => {
    mixedCalls++;
    assert.equal(route.request().headers().authorization, 'Bearer open-batch-key');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
    });
  });
  await page.locator('#batch-confirm-send').click();
  await page.getByText('Calling provider…', { exact: true }).waitFor();
  await page.locator('#drawer-close').click();
  await page.locator('#provider-filter').selectOption('deepseek');
  await page.locator('#batch-open').click();
  assert.equal(await page.locator('#batch-confirm-send').isDisabled(), true);
  releaseBatch();
  await page
    .getByText(/Batch finished\./, { exact: false })
    .first()
    .waitFor();
  assert.equal(mixedCalls, 2);
  assert.equal(await page.locator('#batch-results .report').count(), 2);
  assert.equal(await page.locator('#batch-share').isVisible(), true);
  const privateRecords = await page.evaluate(() =>
    localStorage.getItem('byokit.inference-verifications.v1'),
  );
  assert.ok(
    !privateRecords.includes('deep-batch-key') && !privateRecords.includes('open-batch-key'),
  );
  await page.locator('#drawer-close').click();
  await page.locator('#batch-open').click();
  assert.equal(await page.locator('#batch-results .report').count(), 2);
  assert.equal(await page.locator('#batch-share').isVisible(), true);
  assert.ok(
    await page
      .locator('#verification-drawer')
      .evaluate((el) => el.getBoundingClientRect().width <= innerWidth),
  );
  await page.locator('#verification-drawer').evaluate((el) => {
    el.scrollTop = 0;
  });
  const mobileDrawer = await page.locator('#verification-drawer').boundingBox();
  assert.equal(mobileDrawer.x, 0);
  assert.equal(mobileDrawer.y, 0);
  assert.equal(mobileDrawer.width, 390);
  await page.screenshot({ path: join(tmpdir(), 'byokit-verification-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const desktopDrawer = await page.locator('#verification-drawer').boundingBox();
  assert.equal(desktopDrawer.width, 560);
  assert.equal(desktopDrawer.x, 880);
  await page.locator('#verification-drawer').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const closeButton = await page.locator('#drawer-close').boundingBox();
  assert.ok(closeButton.y >= 0 && closeButton.y + closeButton.height <= 1050);
  await page.locator('#verification-drawer').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(tmpdir(), 'byokit-verification-desktop.png'),
  });
  // The verification-page playground shares the table's controller without
  // replacing its selections or creating another drawer.
  await page.locator('#drawer-close').click();
  const tableSelection = await page.locator('#batch-count').textContent();
  await page
    .locator('#playground-code')
    .fill("return byokit.getModels({ providerIds: ['deepseek'], local: false, limit: 2 });");
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('#verification-drawer').count(), 1);
  await page.locator('.playground-model-pick').first().check();
  await page.locator('#playground-verify-selected').click();
  await page.locator('#verification-drawer').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#batch-keys input').count(), 1);
  assert.equal(mixedCalls, 2, 'opening the shared drawer never sends model requests');
  await page.locator('#drawer-close').click();
  assert.equal(await page.locator('#batch-count').textContent(), tableSelection);
  assert.equal(await page.locator('.playground-model-pick:checked').count(), 1);
  await page
    .locator('#playground-models')
    .screenshot({ path: join(tmpdir(), 'byokit-playground-results-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page
    .locator('#playground-models')
    .screenshot({ path: join(tmpdir(), 'byokit-playground-results-mobile.png') });
  await page.locator('.playground-model-card button:not(:disabled)').first().click();
  await page.locator('#verification-drawer').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#verification-drawer').boundingBox()).width, 390);
  await page.locator('#drawer-close').click();
  await localSetupSmoke(page);
  assert.ok(moduleURLs.length >= 10);
  for (const url of moduleURLs)
    assert.equal(
      new URL(url).searchParams.get('v'),
      assetVersion,
      'all modules use the same deployment version',
    );
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(
    'Website Chrome smoke passed: /byokit/ paths, list modes, filtering, search, paging, Python snippet, inference UI with intercepted fixtures, key privacy, browser-local records, failure handling, desktop/mobile layout, no page or resource errors.',
  );
} finally {
  await browser.close();
}
