const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const { compareVersions, servePrivateBackup } = require('../browser/launcher.cjs');

test('selects the newer portable build numerically', () => {
  assert.ok(compareVersions('1.0.100', '1.0.99') > 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('1.1.9', '1.2.3') < 0);
});

test('private backup is readable once by the studio origin', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glyphfield-import-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'private'));
  await fs.writeFile(path.join(dir, 'private/Projekt.glyphfield.json'), '{"private":true}');
  const ticket = await servePrivateBackup(dir);
  const [port, nonce] = ticket.split('#private=')[1].split('.');
  const url = 'http://127.0.0.1:' + port + '/' + nonce;
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await fetch(url, { headers: { Origin: 'https://example.org' } })).status, 404);
  const authorized = await fetch(url, { headers: { Origin: 'http://127.0.0.1:43496' } });
  assert.equal(authorized.headers.get('cache-control'), 'no-store');
  assert.equal(await authorized.text(), '{"private":true}');
  try { assert.notEqual((await fetch(url)).status, 200); } catch (e) { assert.equal(e.name, 'TypeError'); }
});

test('shutdown tolerates an empty reply from an exiting worker and waits for the HTTP port', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glyphfield-stop-'));
  const state = path.join(dir, 'Glyphfield Browser');
  const id = require('node:crypto').createHash('sha256').update(state.toLowerCase()).digest('hex').slice(0, 22);
  const pipePath = process.platform === 'win32' ? '\\\\.\\pipe\\glyphfield-browser-' + id : path.join(os.tmpdir(), 'glyphfield-' + id + '.sock');
  const service = net.createServer();
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const port = service.address().port;
  const actions = [];
  const pipe = net.createServer(peer => {
    peer.once('data', data => {
      const { action } = JSON.parse(data.toString());
      actions.push(action);
      if (action === 'status') {
        pipe.close();
        setTimeout(() => service.close(), 250);
      }
      peer.end();
    });
  });
  t.after(async () => {
    if (pipe.listening) await new Promise(resolve => pipe.close(resolve));
    if (service.listening) await new Promise(resolve => service.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
  await new Promise(resolve => pipe.listen(pipePath, resolve));
  await exec(process.execPath, [path.join(__dirname, '../browser/launcher.cjs'), '--stop'], {
    env: { ...process.env, LOCALAPPDATA: dir, NODE_ENV: 'test', GLYPHFIELD_BROWSER_TEST_PORT: String(port) },
    timeout: 10000, windowsHide: true,
  });
  assert.deepEqual(actions, ['stop', 'status']);
  assert.equal(service.listening, false);
});

test('portable start reuses, upgrades, rolls back and leaves other services alone', { timeout: 60000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'glyphfield-launcher-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  const env = { ...process.env, LOCALAPPDATA: dir, NODE_ENV: 'test', GLYPHFIELD_BROWSER_TEST_PORT: String(port) };
  const packages = ['1.0.8', '1.0.9', '1.0.10'];
  for (const version of packages) {
    const folder = path.join(dir, version);
    await fs.mkdir(path.join(folder, 'runtime'), { recursive: true });
    await fs.mkdir(path.join(folder, 'web'));
    await fs.copyFile(path.join(__dirname, '../browser/launcher.cjs'), path.join(folder, 'launcher.cjs'));
    const runtime = path.join(folder, 'runtime/node.exe');
    await fs.link(process.execPath, runtime).catch(() => fs.copyFile(process.execPath, runtime));
    await fs.writeFile(path.join(folder, 'build-info.json'), JSON.stringify({version}));
    await fs.writeFile(path.join(folder, 'web/server.js'), version === '1.0.10'
      ? 'throw Error("test broken package");'
      : `require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ identity:true,version:'${version}',pid:process.pid }));}).listen(Number(process.env.PORT), process.env.HOSTNAME);`);
  }
  const command = (version, flag) => exec(process.execPath, [path.join(dir, version, 'launcher.cjs'), flag], { env, timeout: 15000, windowsHide: true });
  t.after(async () => {
    if (probe.listening) await new Promise(resolve => probe.close(resolve));
    await command(packages[0], '--stop').catch(() => {});
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  await assert.rejects(command(packages[0], '--check'), /anderen Programm/);
  assert.equal(probe.listening, true);
  await new Promise(resolve => probe.close(resolve));
  const status = async () => (await fetch('http://127.0.0.1:' + port + '/api/labs')).json();
  await command(packages[0], '--check');
  const original = await status();
  await command(packages[0], '--check');
  assert.deepEqual(await status(), original);
  await command(packages[1], '--check');
  const upgraded = await status();
  assert.equal(upgraded.version, packages[1]);
  await command(packages[0], '--check');
  assert.deepEqual(await status(), upgraded);
  await assert.rejects(command(packages[2], '--check'), /nicht starten/);
  assert.equal((await status()).version, packages[1]);
});
