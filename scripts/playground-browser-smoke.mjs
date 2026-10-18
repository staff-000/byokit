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
