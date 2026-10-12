import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.BYOKIT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/examples/index.html');
 await page.locator('.byokit select').first().waitFor();
 assert.ok(await page.locator('.byokit select').first().locator('option').count()<=8);
 await page.locator('.byokit input[type=password]').fill('demo-secret');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Settings saved',{exact:true}).waitFor();
 assert.ok(!(await page.locator('#output').textContent()).includes('demo-secret'));
 await page.getByRole('button',{name:'Use China preset'}).click();
 assert.ok((await page.locator('.byokit select').first().locator('option').allTextContents()).some(s=>s==='DeepSeek'));
 await page.screenshot({path:'/private/tmp/byokit-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.screenshot({path:'/private/tmp/byokit-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Chrome smoke passed: save, preset switch, secret isolation, mobile layout, no page errors.');
}finally{await browser.close()}
