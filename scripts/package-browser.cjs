const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const version = process.env.GLYPHFIELD_VERSION || require('../package.json').version;

async function runtimeLicense() {
  const local = process.env.GLYPHFIELD_NODE_LICENSE || path.join(path.dirname(process.execPath), 'LICENSE');
  let text;
  try { text = await fs.readFile(local, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT' || process.env.GLYPHFIELD_NODE_LICENSE) throw error;
    const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('Could not obtain license for Node ' + process.version + ': ' + response.status);
    text = await response.text();
  }
  if (!text.includes('Node.js') || text.length < 20000) throw new Error('Node distribution license is incomplete.');
  return text;
}

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Use a Windows x64 Node runtime to pack the Windows browser edition.');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid package version.');
  const web = path.resolve(process.env.GLYPHFIELD_WEB_DIR || path.join(root, 'web'));
  const info = JSON.parse(await fs.readFile(process.env.GLYPHFIELD_BUILD_INFO || path.join(root, 'build-info.json'), 'utf8'));
  for (const relative of ['server.js', '.next/BUILD_ID', 'public', 'node_modules/next/package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    await fs.access(path.join(web, relative));
  }
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'gf-pack-'));
  const dist = path.join(root, 'dist');
  await fs.mkdir(dist, { recursive: true });
  const filename = `Glyphfield-Browser-${version}-win-x64.zip`;
  const archive = path.join(stage, filename);
  try {
    const bundle = path.join(stage, 'Glyphfield');
    await fs.mkdir(path.join(bundle, 'runtime'), { recursive: true });
    await fs.cp(web, path.join(bundle, 'web'), { recursive: true, dereference: true });
    await fs.copyFile(process.execPath, path.join(bundle, 'runtime/node.exe'));
    await fs.writeFile(path.join(bundle, 'runtime/LICENSE'), await runtimeLicense());
    await fs.copyFile(path.join(root, 'LICENSE'), path.join(bundle, 'LICENSE'));
    await fs.writeFile(path.join(bundle, 'build-info.json'), JSON.stringify({ ...info, edition: 'browser', version, node: process.version }, null, 2));
    // Personal backup files may sit next to the launcher during local use.
    // Only these versioned, public entry points belong in a release.
    for (const file of ['Glyphfield starten.cmd', 'Glyphfield beenden.cmd', 'Studio.html', 'launcher.cjs']) {
      await fs.copyFile(path.join(root, 'browser', file), path.join(bundle, file));
    }
    await fs.copyFile(path.join(root, 'browser/import.html'), path.join(bundle, 'web/public/import.html'));
    execFileSync('tar.exe', ['-caf', archive, '-C', stage, 'Glyphfield'], { stdio: 'inherit', windowsHide: true });
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    await fs.copyFile(archive, path.join(dist, filename));
    await fs.writeFile(path.join(dist, filename + '.sha256'), hash.digest('hex') + '  ' + filename + '\n');
    console.log('Created ' + path.join(dist, filename));
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
