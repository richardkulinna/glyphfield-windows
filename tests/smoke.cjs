const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glyphfield-smoke-'));
const executablePath = path.resolve('dist/win-unpacked/Glyphfield Windows.exe');
let instance;
async function launch() {
  instance = await electron.launch({ executablePath, args: ['--smoke-test'], env: { ...process.env, GLYPHFIELD_TEST_PROFILE: profile }, timeout: 120000 });
  const page = await instance.firstWindow({ timeout: 120000 });
  await page.goto('http://127.0.0.1:43127/studio?tool=identity&project=starter');
  await page.waitForFunction(() => { try { return !!window.glyphfield?.studio.readSource(); } catch { return false; } }, { timeout: 90000 });
  return page;
}
(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  let page = await launch();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const created = await page.evaluate(() => window.glyphfield.studio.invoke('identity.project.create', { from: 'starter', name: 'Windows persistence check' }));
  assert.ok(created.id);
  await page.evaluate(() => window.glyphfield.studio.invoke('identity.save'));
  const kit = await page.evaluate(async () => {
    const artifact = await window.glyphfield.studio.invoke('identity.export.kit', { format: 'zip' });
    return { size: artifact.blob.size, head: [...new Uint8Array(await artifact.blob.slice(0, 4).arrayBuffer())] };
  });
  assert.ok(kit.size > 1000);
  assert.deepEqual(kit.head, [80, 75, 3, 4]);
  await page.screenshot({ path: 'test-results/windows-studio.png' });
  await instance.close(); instance = null;
  page = await launch();
  await page.goto(`http://127.0.0.1:43127/studio?tool=identity&project=${encodeURIComponent(created.id)}`);
  await page.waitForFunction(() => { try { return JSON.parse(window.glyphfield.studio.readSource()).name === 'Windows persistence check'; } catch { return false; } }, { timeout: 60000 });
  const labs = await page.evaluate(async () => (await fetch('/api/labs')).json());
  assert.ok(JSON.stringify(labs).includes('identity'));
  console.log('PASS: packaged launch, isolated renderer, brand creation, ZIP export, persisted project after full restart, local API');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (instance) await instance.close(); });
