const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { backupBeforeVersion } = require('../desktop/profile.cjs');
test('version changes preserve IndexedDB and old version; same version does not copy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glyphfield-backup-test-'));
  const profile = path.join(root, 'profile');
  fs.mkdirSync(path.join(profile, 'IndexedDB'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'IndexedDB', 'project'), 'important project');
  fs.writeFileSync(path.join(profile, 'desktop-version.json'), JSON.stringify({ version: '1.0.1' }));
  assert.equal(backupBeforeVersion(profile, path.join(root, 'backups'), '1.0.1'), undefined);
  const backup = backupBeforeVersion(profile, path.join(root, 'backups'), '1.0.2');
  assert.equal(fs.readFileSync(path.join(backup, 'IndexedDB', 'project'), 'utf8'), 'important project');
  assert.equal(JSON.parse(fs.readFileSync(path.join(backup, 'desktop-version.json'))).version, '1.0.1');
  assert.ok(fs.existsSync(path.join(backup, 'backup-complete.json')));
  fs.rmSync(root, { recursive: true });
});
