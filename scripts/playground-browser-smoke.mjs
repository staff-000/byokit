import assert from 'node:assert/strict';
import * as byokit from '../packages/core/catalog.js';
export async function playgroundSmoke(page) {
  const status = page.locator('#playground-status'),
    output = page.locator('#playground-output'),
    editor = page.locator('#playground-code');
  await page.locator('#playground-run').click();
  await page
    .getByText('Finished. Output comes from the real byokit catalog.', { exact: true })
    .waitFor();
  const expected = byokit
    .getModels(byokit.COMPLETE, { local: false, limit: 5, sort: byokit.ModelSort.PriceAscend })
    .map((m) => m.apiModelId);
  assert.deepEqual(
    JSON.parse(await output.textContent()).map((m) => m.model),
    expected,
  );
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
