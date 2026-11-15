const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawn } = require('node:child_process');
function helperEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  return env;
}

async function keepInstaller(version, backups) {
  const folder = path.join(backups, `installer-${version}`);
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, 'setup.exe');
  const response = await fetch(`https://api.github.com/repos/richardkulinna/glyphfield-windows/releases/tags/v${version}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Bisheriger Installer nicht erreichbar (${response.status}). Update bleibt aus Sicherheitsgründen aus.`);
  const release = await response.json();
  const asset = release.assets.find((item) => item.name === `Glyphfield-Windows-Setup-${version}.exe`);
  if (!asset?.digest?.startsWith('sha256:') || !asset.browser_download_url.startsWith('https://github.com/richardkulinna/glyphfield-windows/releases/download/')) throw new Error('Kein prüfbarer Wiederherstellungs-Installer verfügbar.');
  const expected = asset.digest.slice(7);
  if (fs.existsSync(target) && await hashFile(target) === expected) return target;
  const download = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!download.ok) throw new Error(`Installer-Download fehlgeschlagen (${download.status})`);
  await pipeline(Readable.fromWeb(download.body), fs.createWriteStream(`${target}.part`));
  if (await hashFile(`${target}.part`) !== expected) throw new Error('Prüfsumme des Wiederherstellungs-Installers stimmt nicht.');
  fs.renameSync(`${target}.part`, target);
  return target;
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function launchRollback(record, profile, backups, executable) {
  if (!fs.existsSync(record.installer) || !fs.existsSync(record.profile)) throw new Error('Wiederherstellungsdateien fehlen.');
  const script = path.join(backups, 'restore.ps1');
  fs.copyFileSync(path.join(__dirname, 'restore.ps1'), script);
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-ParentId', String(process.pid), '-Profile', profile, '-SavedProfile', record.profile, '-Installer', record.installer,
    '-Executable', executable, '-Backups', backups, '-ExpectedHash', record.sha256], { detached: true, windowsHide: true, stdio: 'ignore', env: helperEnvironment() });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
}
async function launchInstall({ profile, backups, previousInstaller, previousHash, version, installer, executable }) {
  const script = path.join(backups, 'install.ps1');
  fs.copyFileSync(path.join(__dirname, 'install.ps1'), script);
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-ParentId', String(process.pid), '-Profile', profile, '-Backups', backups, '-PreviousInstaller', previousInstaller,
    '-PreviousHash', previousHash, '-Version', version, '-Installer', installer, '-Executable', executable],
  { detached: true, windowsHide: true, stdio: 'ignore', env: helperEnvironment() });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
}
module.exports = { keepInstaller, hashFile, launchRollback, launchInstall };
