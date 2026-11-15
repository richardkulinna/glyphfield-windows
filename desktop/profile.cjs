const fs = require('node:fs');
const path = require('node:path');

function backupBeforeVersion(profile, backups, version) {
  const marker = path.join(profile, 'desktop-version.json');
  if (!fs.existsSync(marker)) return;
  const previous = JSON.parse(fs.readFileSync(marker, 'utf8')).version;
  if (previous === version) return;
  const destination = path.join(backups, `${new Date().toISOString().replace(/[:.]/g, '-')}-v${previous}`);
  fs.mkdirSync(backups, { recursive: true });
  fs.cpSync(profile, destination, { recursive: true, filter: (file) => !['Cache', 'Code Cache', 'GPUCache', 'Crashpad', 'SingletonLock', 'SingletonSocket', 'SingletonCookie'].includes(path.basename(file)) });
  fs.writeFileSync(path.join(destination, 'backup-complete.json'), JSON.stringify({ previous, next: version }));
  return destination;
}
module.exports = { backupBeforeVersion };
