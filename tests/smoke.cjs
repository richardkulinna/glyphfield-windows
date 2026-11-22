const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glyphfield-smoke-'));
const executablePath = process.env.GLYPHFIELD_TEST_EXE || path.resolve('dist/win-unpacked/Glyphfield Windows.exe');
let instance;
async function launch() {
  // Simulate unavailable Internet from process startup; only the bundled loopback server is reachable.
  instance = await electron.launch({ executablePath, args: ['--smoke-test', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost'], env: { ...process.env, GLYPHFIELD_TEST_PROFILE: profile }, timeout: 120000 });
  instance.process().stderr.on('data', (data) => console.error(data.toString()));
  instance.process().stdout.on('data', (data) => console.log(data.toString()));
  const page = await instance.firstWindow({ timeout: 120000 });
  const deadline = Date.now() + 120000;
  while (!await instance.evaluate(({ app }) => app.glyphfieldTestReady === true)) {
    if (Date.now() > deadline) throw new Error('Desktop startup did not complete');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.goto('http://127.0.0.1:43127/studio?tool=identity&project=starter');
  await page.waitForFunction(() => { try { return !!window.glyphfield?.studio.readSource(); } catch { return false; } }, null, { timeout: 90000 });
  return page;
}
(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  let page = await launch();
  assert.equal(await page.evaluate(async () => {
    try { await fetch('https://example.com/', { mode: 'no-cors', signal: AbortSignal.timeout(5000) }); return true; }
    catch { return false; }
  }), false, 'Public Internet must be unavailable during the offline test');
  const updatePolicy = await instance.evaluate(({ app }) => {
    const { createRequire } = process.getBuiltinModule('module');
    const updater = createRequire(app.getAppPath() + '/package.json')('electron-updater').autoUpdater;
    return { autoDownload: updater.autoDownload, autoInstallOnAppQuit: updater.autoInstallOnAppQuit };
  });
  assert.deepEqual(updatePolicy, { autoDownload: false, autoInstallOnAppQuit: false });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const created = await page.evaluate(() => window.glyphfield.studio.invoke('identity.project.create', { from: 'starter', name: 'Windows persistence check' }));
  assert.ok(created.id);
  // Exercise the desktop roles through the same identity pipeline as the editor.
  await page.evaluate(async () => {
    const studio = window.glyphfield.studio;
    const source = JSON.parse(studio.readSource());
    const typography = source.typography.map((entry) => ({
      ...entry, weight: ({ Display: 700, Accent: 600, Code: 900 })[entry.role] ?? entry.weight,
    }));
    await studio.invoke('identity.apply', { identity: { typography }, mode: 'merge', save: true });
  });
  await page.evaluate(() => window.glyphfield.studio.invoke('identity.save'));
  const kit = await page.evaluate(async () => {
    const artifact = await window.glyphfield.studio.invoke('identity.export.kit', { format: 'zip' });
    return { size: artifact.blob.size, head: [...new Uint8Array(await artifact.blob.slice(0, 4).arrayBuffer())] };
  });
  assert.ok(kit.size > 1000);
  assert.deepEqual(kit.head, [80, 75, 3, 4]);
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.screenshot({ path: 'test-results/windows-studio.png', timeout: 60000 });
  await instance.close(); instance = null;
  page = await launch();
  await page.goto(`http://127.0.0.1:43127/studio?tool=identity&project=${encodeURIComponent(created.id)}`);
  await page.waitForFunction(() => { try { return JSON.parse(window.glyphfield.studio.readSource()).name === 'Windows persistence check'; } catch { return false; } }, null, { timeout: 60000 });
  const weights = await page.evaluate(() => Object.fromEntries(
    JSON.parse(window.glyphfield.studio.readSource()).typography.map(({ role, weight }) => [role, weight])
  ));
  assert.deepEqual([weights.Display, weights.Accent, weights.Code], [700, 600, 900]);
  const labs = await page.evaluate(async () => (await fetch('/api/labs')).json());
  assert.ok(JSON.stringify(labs).includes('identity'));
  console.log('PASS OFFLINE: packaged launch, isolated renderer, manual update policy, brand creation, ZIP export, persisted project after full restart, local API; public Internet blocked');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  const log = path.join(profile, 'desktop.log');
  if (fs.existsSync(log)) { fs.copyFileSync(log, 'test-results/desktop.log'); console.log(fs.readFileSync(log, 'utf8')); }
  if (instance) {
    if (process.exitCode) require('node:child_process').execFileSync('taskkill.exe', ['/PID', String(instance.process().pid), '/T', '/F'], { windowsHide: true });
    else await instance.close();
  }
});
