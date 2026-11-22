const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const { createHash, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

const port = process.env.NODE_ENV === 'test' && process.env.GLYPHFIELD_BROWSER_TEST_PORT
  ? Number(process.env.GLYPHFIELD_BROWSER_TEST_PORT) : 43496;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Ungültiger Studio-Port.');
const origin = 'http://127.0.0.1:' + port;
const root = __dirname;
const state = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Glyphfield Browser');
const socketId = createHash('sha256').update(state.toLowerCase()).digest('hex').slice(0, 22);
const socketPath = process.platform === 'win32' ? '\\\\.\\pipe\\glyphfield-browser-' + socketId : path.join(os.tmpdir(), 'glyphfield-' + socketId + '.sock');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const backupName = path.join('private', 'Projekt.glyphfield.json');

function versionAt(directory) {
  const { version } = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Die Versionsangabe im Paket fehlt oder ist fehlerhaft.');
  return version;
}

function compareVersions(left, right) {
  const b = right.split('.').map(Number);
  return left.split('.').map((value, index) => Number(value) - b[index]).find(Boolean) || 0;
}

async function userKey() {
  fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const file = path.join(state, 'control.key');
  try { fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  for (let i = 0; i < 10; i++) {
    const key = fs.readFileSync(file, 'utf8');
    if (/^[a-f0-9]{64}$/.test(key)) return key;
    await sleep(50);
  }
  throw Error('Die lokale Starterdatei ist beschädigt: ' + file);
}

// The control protocol stays off HTTP. Only the owner of the local key can stop this worker.
function request(key, action, directory, duringShutdown = false) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let data = '';
    let connected = false;
    const disconnected = () => resolve(action === 'stop' ? { stopping: true } : null);
    socket.setTimeout(3000, () => socket.destroy(new Error('Der laufende Browserstarter antwortet nicht.')));
    socket.on('connect', () => {
      connected = true;
      socket.write(JSON.stringify({ key, action, directory }) + '\n');
    });
    socket.setEncoding('utf8');
    socket.on('data', chunk => { data += chunk; if (data.length > 16384) socket.destroy(new Error('Ungültige Antwort.')); });
    socket.on('error', error => {
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') resolve(null);
      else if (duringShutdown && connected && !data && ['ECONNRESET', 'EPIPE'].includes(error.code)) disconnected();
      else reject(error);
    });
    socket.on('end', () => {
      if (duringShutdown && !data) { disconnected(); return; }
      try {
        const reply = JSON.parse(data);
        if (reply.error) reject(Error(reply.error)); else resolve(reply);
      } catch (error) { reject(error); }
    });
  });
}

function freePort() {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.on('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function waitFor(check, timeout) {
  const end = Date.now() + timeout;
  do {
    if (await check()) return true;
    await sleep(180);
  } while (Date.now() < end);
  return false;
}

async function healthy() {
  try {
    const r = await fetch(origin + '/api/labs', { signal: AbortSignal.timeout(2500) });
    if (r.ok && (r.headers.get('content-type') || '').includes('application/json')) return JSON.stringify(await r.json()).includes('identity');
    await r.body?.cancel();
  } catch {}
  return false;
}

async function start(directory, key) {
  const logPath = path.join(state, 'launcher.log');
  const fd = fs.openSync(logPath, 'a');
  let child;
  try {
    child = spawn(path.join(directory, 'runtime', 'node.exe'), [path.join(directory, 'launcher.cjs'), '--serve'], {
      cwd: directory, detached: true, windowsHide: true, stdio: ['ignore', fd, fd],
    });
  } finally { fs.closeSync(fd); }
  let error;
  child.on('error', value => { error = value; });
  child.unref();
  const ready = await waitFor(async () => {
    if (error) throw error;
    const running = await request(key, 'status');
    if (running && await healthy()) return true;
    if (child.exitCode !== null && !running) throw Error('Das Studio konnte nicht starten. Protokoll: ' + logPath);
    return false;
  }, 90000);
  if (!ready) throw Error('Das Studio hat den Start nicht bestätigt. Protokoll: ' + logPath);
}

async function stop(key) {
  const reply = await request(key, 'stop', undefined, true);
  if (reply && !await waitFor(async () => !(await request(key, 'status', undefined, true)) && await freePort(), 10000)) {
    throw Error('Der Browserdienst ist noch in Benutzung. Bitte kurz warten und den Starter nochmals öffnen.');
  }
}

async function servePrivateBackup(directory) {
  const file = path.join(directory, backupName);
  const bytes = await fs.promises.readFile(file);
  const nonce = randomBytes(32).toString('base64url');
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.headers.origin !== origin || req.url !== '/' + nonce) {
      res.writeHead(404); res.end(); return;
    }
    if (used) { res.writeHead(410); res.end(); return; }
    used = true;
    res.writeHead(200, {
      'Access-Control-Allow-Origin': origin, 'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Connection': 'close',
    });
    res.end(bytes);
    server.close();
  });
  let used = false;
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const timer = setTimeout(() => { server.close(); server.closeAllConnections(); }, 90000);
  timer.unref();
  server.once('close', () => clearTimeout(timer));
  return '/import.html#private=' + server.address().port + '.' + nonce;
}

async function serve(key) {
  const version = versionAt(root);
  const controller = net.createServer(socket => {
    let message = '';
    socket.setEncoding('utf8'); socket.setTimeout(4000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', async chunk => {
      message += chunk;
      if (message.length > 8192) { socket.destroy(); return; }
      if (!message.includes('\n')) return;
      socket.removeAllListeners('data');
      try {
        const input = JSON.parse(message);
        if (input.key !== key) throw Error('Ungültiger Starterschlüssel.');
        if (input.action === 'status') socket.end(JSON.stringify({ root, version }));
        else if (input.action === 'stop') {
          // Stop accepting requests, then wait for existing peers to receive their replies.
          if (controller.listening) controller.close(() => process.exit(0));
          socket.end('{"stopping":true}');
        } else if (input.action === 'import' && typeof input.directory === 'string' && path.isAbsolute(input.directory)) {
          socket.end(JSON.stringify({ url: await servePrivateBackup(input.directory) }));
        } else throw Error('Unbekannte Starteranfrage.');
      } catch (error) { socket.end(JSON.stringify({ error: error.message })); }
    });
  });
  await new Promise((resolve, reject) => {
    controller.once('error', reject); controller.listen(socketPath, resolve);
  });
  Object.assign(process.env, { PORT: String(port), HOSTNAME: '127.0.0.1', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' });
  require(path.join(root, 'web', 'server.js'));
}

async function launch(mode) {
  const key = await userKey();
  if (mode === '--serve') return serve(key);
  if (mode === '--stop') return stop(key);
  if (!['', '--check', '--import', '--private'].includes(mode)) throw Error('Unbekannte Starteroption.');
  const version = versionAt(root);
  fs.accessSync(path.join(root, 'web', 'server.js'));
  fs.accessSync(path.join(root, 'runtime', 'node.exe'));
  let previous = await request(key, 'status');
  if (!previous && !await freePort()) {
    // A simultaneous double-click may be starting our own worker.
    await waitFor(async () => Boolean(previous = await request(key, 'status')), 1200);
    if (!previous) throw Error('Die Adresse ' + origin + ' wird von einem anderen Programm verwendet. Beende den früheren Glyphfield-Browserstarter bzw. das Programm auf Port ' + port + ' und öffne den Starter erneut.');
  }
  const upgrade = previous && compareVersions(version, previous.version) > 0;
  const unhealthy = previous && !await healthy() && !await waitFor(healthy, 15000);
  if (upgrade || unhealthy) await stop(key);
  if (!previous || upgrade || unhealthy) {
    try { await start(root, key); }
    catch (error) {
      if (upgrade) {
        // Only restore the package that was already in use, and only if its files remain.
        try { await stop(key); await start(previous.root, key); }
        catch (restore) { throw Error(error.message + '\nDie vorige Version konnte nicht erneut starten: ' + restore.message); }
      }
      throw error;
    }
  }
  if (mode === '--check') { console.log(origin + '/studio'); return; }
  let route = mode === '--import' ? '/import.html' : '/studio';
  if (fs.existsSync(path.join(root, backupName))) route = (await request(key, 'import', root)).url;
  if (!/^\/(?:studio|import\.html(?:#private=\d+\.[\w-]+)?)$/.test(route)) throw Error('Ungültiger Studio-Pfad.');
  const opener = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', origin + route], { detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { opener.once('error', reject); opener.once('spawn', resolve); });
  opener.unref();
}

module.exports = { compareVersions, servePrivateBackup };
if (require.main === module) launch(process.argv[2] || '').catch(error => { console.error(error.message); process.exit(1); });
