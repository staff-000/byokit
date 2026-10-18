import assert from 'node:assert/strict';
import * as byokit from '../packages/byokit/catalog.js';
import { successRecord } from '../website/inference.js';
export async function playgroundSmoke(page) {
  const status = page.locator('#playground-status'),
    output = page.locator('#playground-output'),
    editor = page.locator('#playground-code');
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  const expected = byokit.getModels().map((m) => m.apiModelId || '(configure local server)');
  assert.deepEqual(
    JSON.parse(await output.textContent()).map((m) => m.model),
    expected,
  );
  const model = byokit.getModels({ local: false })[0];
  const record = successRecord(
    {
      offeringId: model.id,
      providerId: model.providerId,
      modelId: model.apiModelId,
      protocol: model.connection.protocol,
      maxTokens: 128,
    },
    { checkedAt: new Date().toISOString(), latencyMs: 100, usage: {} },
  );
  await page.evaluate((record) => {
    localStorage.setItem('byokit.inference-verifications.v1', JSON.stringify([record]));
  }, record);
  await page.locator('#playground-example').selectOption('matchers');
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  assert.match(await output.textContent(), /Found \d+ matching models:/);
  assert.ok(!(await output.textContent()).includes('TypeError'));
  await page.evaluate(() => localStorage.removeItem('byokit.inference-verifications.v1'));
  await editor.fill(
    'console.log(byokit.getModels({ local: false, limit: 2 }).map(m => m.apiModelId))',
  );
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  assert.equal(JSON.parse(await output.textContent()).length, 2);
  await editor.fill('const = ;');
  await page.locator('#playground-run').click();
  await page
    .getByText('JavaScript error. Edit your code and try again.', { exact: true })
    .waitFor();
  assert.ok((await output.textContent()).includes('SyntaxError'));
  await editor.fill('while (true) {}');
  await page.locator('#playground-run').click();
  await page
    .getByText('Stopped after 3 seconds. Shorten your code and try again.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('#playground-run').isEnabled(), true);
  await page.locator('#playground-run').click();
  await page.locator('#playground-stop').click();
  assert.ok((await status.textContent()).startsWith('Stopped.'));
  let unexpectedRequests = 0;
  const observe = (request) => {
    if (request.url().startsWith('https://example.com/')) unexpectedRequests++;
  };
  page.on('request', observe);
  await editor.fill(
    'try { await fetch("https://example.com/playground-test"); console.log("UNEXPECTED") } catch { console.log("network blocked") }',
  );
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  assert.equal(await output.textContent(), 'network blocked');
  assert.equal(unexpectedRequests, 0);
  page.off('request', observe);
  await page.locator('#playground-example').selectOption('custom');
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  assert.equal(JSON.parse(await output.textContent()).verification.status, 'unverified');
  await page.locator('#playground-example').selectOption('price');
}

export async function playgroundVerificationSmoke(page) {
  const editor = page.locator('#playground-code');
  const run = async (code) => {
    await editor.fill(code);
    await page.locator('#playground-run').click();
    await page
      .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
      .waitFor();
  };
  assert.equal(await page.locator('#availability-run-btn').count(), 0);
  assert.equal(await page.locator('#verification-drawer').count(), 1);
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const mock = async (route) => {
    calls++;
    const request = route.request();
    const expected = request.url().includes('deepseek.com')
      ? 'deep-playground-key'
      : 'open-playground-key';
    assert.equal(request.headers().authorization, 'Bearer ' + expected);
    const body = request.postDataJSON();
    assert.ok(['deepseek-chat', 'gpt-5.6-terra'].includes(body.model));
    await gate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: 'OK' } }],
        usage: { completion_tokens: body.max_tokens === 1 ? 1 : 20 },
      }),
    });
  };
  await page.route('https://api.deepseek.com/**', mock);
  await page.route('https://api.openai.com/**', mock);
  // Selection spans result pages, caps at ten, and never calls a provider.
  await run(
    'return byokit.getModels(byokit.COMPLETE, { local: false, filters: { callable: true }, limit: 45 });',
  );
  assert.equal(await page.locator('.playground-model-card').count(), 40);
  await page.locator('.playground-model-pick').first().check();
  await page.locator('#playground-models-more').click();
  assert.equal(await page.locator('.playground-model-card').count(), 45);
  assert.equal(await page.locator('.playground-model-pick').first().isChecked(), true);
  for (let i = 1; i < 10; i++) await page.locator('.playground-model-pick').nth(i).check();
  assert.equal(await page.locator('.playground-model-pick:checked').count(), 10);
  assert.equal(await page.locator('.playground-model-pick').nth(10).isDisabled(), true);
  assert.equal(calls, 0);
  await page.locator('#playground-selection-clear').click();
  const query = `return byokit.getModels(byokit.COMPLETE, { local: false }).filter(m => ['deepseek/deepseek-chat', 'openai/gpt-5.6-terra'].includes(m.id) || m.providerId === '302ai').slice(0, 50);`;
  // Put the supported models first, independently of catalog ordering.
  const orderedQuery = query.replace(
    '.slice(0, 50)',
    '.sort((a,b) => Number(b.callSupport.textGeneration) - Number(a.callSupport.textGeneration)).slice(0, 4)',
  );
  await run(orderedQuery);
  const unsupported = page
    .locator('.playground-model-card')
    .filter({ hasText: 'No reviewed provider adapter' })
    .first();
  assert.equal(await unsupported.locator('input').isDisabled(), true);
  assert.equal(
    await unsupported.getByRole('button', { name: 'Verify', exact: true }).isDisabled(),
    true,
  );
  for (const id of ['deepseek/deepseek-chat', 'openai/gpt-5.6-terra'])
    await page
      .locator('.playground-model-card')
      .filter({ has: page.locator(`[data-playground-model="${id}"]`) })
      .locator('input')
      .check();
  const verifySelected = page.locator('#playground-verify-selected');
  await verifySelected.scrollIntoViewIfNeeded();
  const beforeScroll = await page.evaluate(() => scrollY);
  await verifySelected.click();
  await page.locator('#verification-drawer').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#verification-drawer').isVisible(), true);
  assert.equal(await page.locator('#batch-keys input').count(), 2);
  assert.equal(calls, 0);
  await page.locator('#batch-confirm-send').click();
  assert.equal(calls, 0, 'missing keys send no provider requests');
  await page.locator('#drawer-close').click();
  assert.ok(Math.abs((await page.evaluate(() => scrollY)) - beforeScroll) < 3);
  assert.equal(await verifySelected.evaluate((el) => el === document.activeElement), true);
  assert.equal(await editor.inputValue(), orderedQuery);
  assert.equal(await page.locator('.playground-model-pick:checked').count(), 2);
  await verifySelected.click();
  await page.locator('#batch-keys [data-provider="deepseek"]').fill('deep-playground-key');
  await page.locator('#batch-keys [data-provider="openai"]').fill('open-playground-key');
  await page.locator('#batch-confirm-send').click();
  await page.getByText('Calling provider…', { exact: true }).waitFor();
  await page.locator('#drawer-close').click();
  assert.equal(await page.locator('#playground-verification-reopen').isVisible(), true);
  assert.equal(await page.locator('#playground-verification-cancel').isVisible(), true);
  // Running another offline query must not abort or change the captured batch.
  await run(orderedQuery);
  await page.locator('#playground-verification-reopen').click();
  release();
  await page
    .getByText(/Batch finished\./)
    .first()
    .waitFor();
  assert.equal(calls, 2);
  assert.equal(await page.locator('#batch-share').isVisible(), true);
  const href = await page.locator('#batch-share').getAttribute('href');
  assert.ok(!decodeURIComponent(href).includes('playground-key'));
  await page.locator('#drawer-close').click();
  assert.equal(await page.locator('.playground-personal-attempt:not([hidden])').count(), 2);
  const single = page
    .locator('.playground-model-card')
    .filter({ has: page.locator('[data-playground-model="deepseek/deepseek-chat"]') })
    .getByRole('button', { name: 'Verify', exact: true });
  await single.click();
  assert.match(await page.locator('#selected-name').textContent(), /DeepSeek/);
  assert.equal(calls, 2, 'opening the single-model drawer sends no requests');
  await page.locator('#verify').click();
  await page
    .locator('#call-status')
    .filter({ hasText: /Call succeeded/ })
    .waitFor();
  assert.equal(calls, 4, 'single-model speed verification uses the existing two-call benchmark');
  await page.locator('#drawer-close').click();
  assert.equal(await single.evaluate((el) => el === document.activeElement), true);
  const stored = await page.evaluate(() =>
    localStorage.getItem('byokit.inference-verifications.v1'),
  );
  assert.ok(!stored.includes('playground-key'));
  await page.evaluate(() => localStorage.removeItem('byokit.inference-verifications.v1'));
  await page.unroute('https://api.deepseek.com/**', mock);
  await page.unroute('https://api.openai.com/**', mock);
}
