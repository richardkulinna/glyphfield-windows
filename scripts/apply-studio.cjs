const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor');
const studio = path.join(root, 'studio');
const manifest = JSON.parse(fs.readFileSync(path.join(studio, 'upstream-files.json'), 'utf8'));

function normalized(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

// Check every input before writing. An upstream edit requires a deliberate merge.
const writes = [];
for (const [relative, before] of Object.entries(manifest)) {
  if (!/^(?:src|content\/docs)\/[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..')) {
    throw new Error('Invalid Studio source path: ' + relative);
  }
  const target = path.join(vendor, relative);
  const next = normalized(path.join(studio, relative));
  const current = fs.existsSync(target) ? normalized(target) : null;
  if (current === next) continue;
  const digest = current === null ? null : createHash('sha256').update(current).digest('hex');
  if (digest !== before) throw new Error('Merge upstream changes before releasing: ' + relative);
  writes.push({ target, next });
}
for (const { target, next } of writes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, next);
}
