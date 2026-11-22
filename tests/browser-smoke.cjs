const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:43496';
const name = 'Portable browser persistence check';
const marker = 'Place the local project illustration precisely.';
const version = process.env.GLYPHFIELD_VERSION || require('../package.json').version;

async function main() {
  // Testing must never switch or stop a developer's existing Studio.
  await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(43496, '127.0.0.1', () => socket.close(resolve));
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gf-browser-test-'));
  const app = path.join(dir, 'Glyphfield');
  const profile = path.join(dir, 'profile');
  const evidence = path.join(root, 'test-results');
  const launch = (arg) => execFileSync(path.join(app, 'runtime/node.exe'), [path.join(app, 'launcher.cjs'), arg], {
    cwd: app, env: { ...process.env, LOCALAPPDATA: path.join(dir, 'user') },
    windowsHide: true, stdio: 'inherit', timeout: 120000,
  });
  let context;
  let started = false;
  async function open(tool, id) {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, serviceWorkers: 'block', viewport: { width: 1440, height: 960 },
    });
    await context.route(/^https?:/, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = context.pages()[0] || await context.newPage();
    await page.goto(origin + '/studio?tool=' + tool + '&project=' + encodeURIComponent(id));
    await page.waitForFunction((tool) => {
      try {
        const source = JSON.parse(window.glyphfield.studio.readSource());
        return tool === 'identity' ? !!source.typography : !!source.sections?.length;
      } catch { return false; }
    }, tool, { timeout: 90000 });
    return page;
  }
  try {
    await fs.mkdir(evidence, { recursive: true });
    execFileSync('tar.exe', ['-xf', path.join(root, 'dist', 'Glyphfield-Browser-' + version + '-win-x64.zip'), '-C', dir], { windowsHide: true });
    launch('--check');
    started = true;
    const page = await open('identity', 'starter');
    const importer = await page.request.get(origin + '/import.html');
    assert.equal(importer.status(), 200);
    assert.match(await importer.text(), /type=["']file["']/i);
    const created = await page.evaluate(name => window.glyphfield.studio.invoke('identity.project.create', { from: 'starter', name }), name);
    assert.ok(created.id);
    const id = created.id;
    const waitForProject = (currentPage) => currentPage.waitForFunction(name => {
      try { return JSON.parse(window.glyphfield.studio.readSource()).name === name; } catch { return false; }
    }, name, { timeout: 60000 });
    await waitForProject(page);
    await page.evaluate(async marker => {
      const api = window.glyphfield.studio;
      await api.invoke('identity.apply', { identity: { dossier: { renderingRecipe: [marker] } }, mode: 'merge', save: true });
      await api.invoke('identity.save');
    }, marker);
    await context.close();
    context = undefined;
    launch('--stop');
    started = false;
    launch('--check');
    started = true;
    const reopened = await open('identity', id);
    await waitForProject(reopened);
    const exported = await reopened.evaluate(async () => {
      const api = window.glyphfield.studio;
      const doc = JSON.parse(api.readSource());
      const single = await api.invoke('identity.export.kit', { format: 'markdown' });
      const kit = await api.invoke('identity.export.kit', { format: 'zip' });
      const bytes = new Uint8Array(await kit.blob.arrayBuffer());
      const view = new DataView(bytes.buffer), decoder = new TextDecoder();
      let archived;
      for (let offset = 0; offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50;) {
        const size = view.getUint32(offset + 18, true);
        const end = offset + 30 + view.getUint16(offset + 26, true);
        const start = end + view.getUint16(offset + 28, true);
        const filename = decoder.decode(bytes.subarray(offset + 30, end));
        if (filename.endsWith('/brand.md')) archived = decoder.decode(bytes.subarray(start, start + size));
        offset = start + size;
      }
      const markdown = await single.blob.text();
      return { name: doc.name, markdown, equal: markdown === archived };
    });
    assert.equal(exported.name, name);
    assert.ok(exported.markdown.includes(marker));
    assert.equal(exported.equal, true);
    await reopened.goto(origin + '/studio?tool=brand-book&project=' + encodeURIComponent(id));
    await reopened.waitForFunction(() => {
      try { return !!JSON.parse(window.glyphfield.studio.readSource()).sections?.length; } catch { return false; }
    }, null, { timeout: 90000 });
    // The browser edition uses the browser print dialog. Exercise that entry
    // and the corresponding Chromium print stylesheet without a modal in CI.
    await reopened.evaluate(() => {
      window.print = () => {
        const html = document.documentElement.cloneNode(true);
        html.querySelectorAll('script').forEach(script => script.remove());
        window.glyphfieldPrintSnapshot = '<!doctype html>' + html.outerHTML;
      };
    });
    await reopened.getByRole('button', { name: /Export PDF/i }).first().click();
    await reopened.waitForFunction(() => Boolean(window.glyphfieldPrintSnapshot));
    const snapshot = await reopened.evaluate(() => window.glyphfieldPrintSnapshot);
    const printView = await context.newPage();
    const printUrl = origin + '/studio?test-print-capture';
    await printView.route(printUrl, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: snapshot }));
    await printView.goto(printUrl);
    await printView.evaluate(() => document.fonts.ready.then(() => true));
    const pdf = await printView.pdf({ printBackground: true, preferCSSPageSize: true });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1, 'Book export should contain multiple pages.');
    await reopened.screenshot({ path: path.join(evidence, 'browser-brandbook.png') });
    console.log('PASS: extracted portable ZIP, local startup, real browser, private import route, saved project after full restart, kit parity and multipage PDF.');
  } finally {
    try { if (context) await context.close(); }
    finally {
      if (started) launch('--stop');
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 500 });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
