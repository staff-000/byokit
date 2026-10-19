import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function localSetupSmoke(page) {
  const calls = [];
  for (const host of ['http://localhost:11434/**', 'http://localhost:8000/**']) {
    await page.route(host, async (route) => {
      const request = route.request();
      calls.push({
        method: request.method(),
        url: request.url(),
        key: request.headers().authorization,
      });
      const body = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          request.method() === 'GET'
            ? { data: [{ id: 'installed-local' }], models: [{ name: 'installed-local' }] }
            : request.url().endsWith('/api/chat')
              ? {
                  message: { content: 'OK' },
                  done: true,
                  eval_count: body.options.num_predict === 1 ? 1 : 40,
                }
              : {
                  choices: [{ message: { content: 'OK' } }],
                  usage: { prompt_tokens: 8, completion_tokens: body.max_tokens === 1 ? 1 : 40 },
                },
        ),
      });
    });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('#setup-local').click();
  await page.locator('#local-setup-url').fill('http://localhost:11434/v1');
  await page.locator('#local-setup-api').selectOption('openai-compatible');
  await page.locator('#local-setup-model').fill('installed-local');
  await page.getByRole('button', { name: 'Use this model', exact: true }).click();
  assert.equal(calls.length, 0, 'configuration never contacts a server');
  assert.equal(await page.locator('#verification-drawer').isVisible(), false);
  assert.match(await page.locator('#local-sdk-example').textContent(), /byokit.call/);
  await page
    .locator('#local-setup')
    .screenshot({ path: join(tmpdir(), 'byokit-local-configured-desktop.png') });
  await page.locator('#local-edit').click();
  await page.locator('#local-find').click();
  await page.getByText('1 models found. Choose or enter a model ID.', { exact: true }).waitFor();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(
    await page.locator('#local-discovered-models option').getAttribute('value'),
    'installed-local',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const box = await page.locator('#local-setup').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page
    .locator('#local-setup')
    .screenshot({ path: join(tmpdir(), 'byokit-local-setup-mobile.png') });
  await page.getByRole('button', { name: 'Use this model', exact: true }).click();
  await page.locator('#local-verify').click();
  await page.locator('#verification-drawer').waitFor({ state: 'visible' });
  await page.locator('#api-key').fill('local-only-secret');
  await page.locator('#verify').click();
  await page.locator('#response-text').waitFor({ state: 'visible' });
  assert.equal(calls.filter((call) => call.method === 'POST').length, 2);
  assert.ok(
    calls
      .filter((call) => call.method === 'POST')
      .every((call) => call.key === 'Bearer local-only-secret'),
  );
  assert.equal(await page.locator('#share-verification').isVisible(), false);
  await page.locator('#local-edit-verification').click();
  await page.locator('#local-setup-url').fill('http://localhost:8000');
  await page.locator('#local-setup-api').selectOption('ollama');
  await page.locator('#local-setup-model').fill('different-model');
  await page.getByRole('button', { name: 'Use this model', exact: true }).click();
  const callsBeforeSecond = calls.length;
  await page.locator('#local-verify').click();
  assert.equal(await page.locator('#api-key').inputValue(), '');
  await page.locator('#verify').click();
  await page.locator('#response-text').waitFor({ state: 'visible' });
  assert.equal(calls.length, callsBeforeSecond + 2);
  assert.ok(
    calls
      .slice(callsBeforeSecond)
      .every((call) => call.url === 'http://localhost:8000/api/chat' && !call.key),
  );
  const localRecords = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('byokit.inference-verifications.v1')).filter(
      (record) => record.providerId === 'local',
    ),
  );
  assert.equal(new Set(localRecords.map((record) => record.offeringId)).size, 2);
  assert.ok(!JSON.stringify(localRecords).includes('local-only-secret'));
  await page.locator('#drawer-close').click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('#playground-example').selectOption('local');
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Set up local', exact: true }).click();
  await page.locator('#local-setup').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#local-setup-api').inputValue(), 'ollama');
  assert.equal(await page.locator('#local-setup-model').inputValue(), 'my-installed-model');
  const beforeClose = calls.length;
  await page.locator('#local-close').click();
  assert.equal(calls.length, beforeClose);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Set up local');
}
