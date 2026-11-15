const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { backupBeforeVersion } = require('./profile.cjs');
const { keepInstaller, hashFile, launchRollback, launchInstall } = require('./updates.cjs');

const smoke = process.argv.includes('--smoke-test');
const profile = process.env.GLYPHFIELD_TEST_PROFILE && smoke ? process.env.GLYPHFIELD_TEST_PROFILE : path.join(app.getPath('appData'), 'Glyphfield Windows');
app.setPath('userData', profile);
const backups = `${profile}-backups`;
const port = 43127;
const origin = `http://127.0.0.1:${port}`;
let window, server, quitting = false, updating = false, availableUpdate = false, updateStatus = 'Noch nicht geprüft';
const log = (message) => {
  fs.mkdirSync(profile, { recursive: true });
  fs.appendFileSync(path.join(profile, 'desktop.log'), `${new Date().toISOString()} ${message}\n`);
};
if (!app.requestSingleInstanceLock()) app.quit();
else {
  try { backupBeforeVersion(profile, backups, app.getVersion()); }
  catch (error) { dialog.showErrorBox('Datensicherung fehlgeschlagen', `Die neue Version startet zum Schutz deiner Daten nicht.\n${error.message}`); app.exit(1); }
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(start).catch((error) => { log(error.stack); dialog.showErrorBox('Glyphfield konnte nicht starten', error.message); app.quit(); });
}

async function start() {
  // Fail closed on port conflicts. A stable origin preserves IndexedDB and localStorage.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`Port ${port} wird bereits verwendet. Bitte die andere Instanz schließen.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  const web = path.join(app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..'), 'web');
  server = utilityProcess.fork(path.join(web, 'server.js'), [], {
    cwd: web, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), NEXT_TELEMETRY_DISABLED: '1' }
  });
  let serverExited = false;
  server.stdout.on('data', (data) => log(data.toString()));
  server.stderr.on('data', (data) => log(data.toString()));
  server.on('exit', (code) => { serverExited = true; if (!quitting) { log(`Server exited: ${code}`); if (window) { dialog.showErrorBox('Lokaler Server beendet', 'Bitte Glyphfield neu starten. Deine gespeicherten Daten bleiben erhalten.'); app.quit(); } } });
  const deadline = Date.now() + 90000;
  while (true) {
    if (serverExited) throw new Error('Der lokale Glyphfield-Server wurde unerwartet beendet. Details stehen in desktop.log.');
    try { const response = await fetch(`${origin}/api/labs`, { signal: AbortSignal.timeout(2000) }); if (response.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Der lokale Server antwortet nicht.');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 800, minHeight: 600, show: !smoke, title: 'Glyphfield Windows', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url) && !url.startsWith(origin + '/')) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) { event.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Datei', submenu: [{ role: 'quit', label: 'Beenden' }] },
    { label: 'Bearbeiten', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Ansicht', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'App', submenu: [
      { label: 'Nach Updates suchen', click: () => checkUpdates(true) },
      { label: 'Update installieren …', click: installUpdate },
      { label: 'Letztes Update zurücknehmen …', click: rollback },
      { label: 'Update-Status', click: () => dialog.showMessageBox(window, { message: updateStatus, detail: `Version ${app.getVersion()}. Installation nur nach deinem Klick.` }) },
      { label: 'Datenordner öffnen', click: () => shell.openPath(profile) },
      { label: 'Sicherungen öffnen', click: () => { fs.mkdirSync(backups, { recursive: true }); shell.openPath(backups); } },
      { label: 'Versionen und Wiederherstellung', click: () => shell.openExternal('https://github.com/richardkulinna/glyphfield-windows#daten-und-wiederherstellung') }
    ] }
  ]));
  await window.loadURL(`${origin}/studio`);
  fs.writeFileSync(path.join(profile, 'desktop-version.json'), JSON.stringify({ version: app.getVersion() }));
  if (app.isPackaged && !smoke) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on('error', (error) => { updateStatus = `Update fehlgeschlagen: ${error.message}`; log(updateStatus); });
    autoUpdater.on('update-available', (info) => { availableUpdate = true; updateStatus = `Version ${info.version} verfügbar. App → Update installieren.`; window.setTitle(`Glyphfield Windows – Update ${info.version} verfügbar`); });
    autoUpdater.on('update-not-available', () => { updateStatus = 'App ist aktuell'; });
    autoUpdater.on('update-downloaded', (info) => { updateStatus = `Version ${info.version} bereit`; });
    checkUpdates(false);
    setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000).unref();
  }
}
async function checkUpdates(manual) {
  if (!app.isPackaged || smoke) return;
  const pauseFile = path.join(backups, 'updates-paused');
  if (fs.existsSync(pauseFile)) {
    if (!manual) { updateStatus = 'Nach Wiederherstellung pausiert. Manuelle Update-Suche setzt die Prüfung fort.'; return; }
    fs.unlinkSync(pauseFile);
  }
  try {
    await autoUpdater.checkForUpdates();
    if (manual) await dialog.showMessageBox(window, { message: updateStatus });
  } catch (error) { log(error.message); if (manual) dialog.showErrorBox('Update-Prüfung fehlgeschlagen', error.message); }
}
async function closeForSnapshot() {
  updating = true;
  // Destroy renderer before copying Chromium databases; flush pending session storage.
  window.destroy();
  session.defaultSession.flushStorageData();
  await session.defaultSession.closeAllConnections();
}
async function installUpdate() {
  if (updating) return;
  if (!availableUpdate) { await checkUpdates(true); if (!availableUpdate) return; }
  const answer = await dialog.showMessageBox(window, { type: 'question', buttons: ['Abbrechen', 'Sichern und installieren'], defaultId: 0, cancelId: 0, message: 'Update installieren?', detail: 'Bitte laufende Exporte abschließen und Änderungen speichern. Die App sichert den bisherigen Stand und startet anschließend neu.' });
  if (answer.response !== 1) return;
  updating = true;
  try {
    updateStatus = 'Wiederherstellungs-Installer wird gesichert …';
    const installer = await keepInstaller(app.getVersion(), backups);
    updateStatus = 'Update wird heruntergeladen …';
    const files = await autoUpdater.downloadUpdate();
    const nextInstaller = files.find((file) => file.endsWith('.exe'));
    if (!nextInstaller) throw new Error('Update enthält keinen Windows-Installer.');
    const previousHash = await hashFile(installer);
    await closeForSnapshot();
    await launchInstall({ profile, backups, previousInstaller: installer, previousHash, version: app.getVersion(), installer: nextInstaller, executable: app.getPath('exe') });
    app.quit();
  } catch (error) {
    updating = false;
    dialog.showErrorBox('Update nicht installiert', error.message);
    if (window.isDestroyed()) app.quit();
  }
}
async function rollback() {
  if (updating) return;
  try {
    const file = path.join(backups, 'rollback.json');
    if (!fs.existsSync(file)) { await dialog.showMessageBox(window, { message: 'Noch kein vorheriges Update zum Zurücknehmen vorhanden.' }); return; }
    const record = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const answer = await dialog.showMessageBox(window, { type: 'warning', buttons: ['Abbrechen', 'Version wiederherstellen'], defaultId: 0, cancelId: 0, message: `Version ${record.version} wiederherstellen?`, detail: 'Die App stellt Programm und damalige Projektdaten wieder her. Neuere Projektdaten bleiben separat in den Sicherungen erhalten. Automatische Update-Suche wird bis zur nächsten manuellen Suche pausiert.' });
    if (answer.response !== 1) return;
    await closeForSnapshot();
    await launchRollback(record, profile, backups, app.getPath('exe'));
    app.quit();
  } catch (error) { updating = false; dialog.showErrorBox('Wiederherstellung fehlgeschlagen', error.message); if (window?.isDestroyed()) app.quit(); }
}
app.on('before-quit', () => { quitting = true; server?.kill(); });
app.on('window-all-closed', () => { if (!updating) app.quit(); });
