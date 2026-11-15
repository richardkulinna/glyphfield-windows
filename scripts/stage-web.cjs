const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.on('uncaughtException', (error) => { console.error(error.stack); process.exitCode = 1; });
const vendor = path.join(root, 'vendor');
const target = path.join(root, 'web');
if (fs.existsSync(target)) throw new Error('web already exists; use a clean build directory.');
console.log('Staging standalone from', path.join(vendor, '.next/standalone'));
copyTree(path.join(vendor, '.next/standalone'), target);
console.log('Staging public assets');
fs.cpSync(path.join(vendor, 'public'), path.join(target, 'public'), { recursive: true });
fs.cpSync(path.join(vendor, '.next/static'), path.join(target, '.next/static'), { recursive: true });
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) fs.copyFileSync(path.join(vendor, file), path.join(target, file));
if (!fs.existsSync(path.join(target, 'server.js'))) throw new Error('Standalone server missing');
console.log('Standalone server staged successfully');

function copyTree(source, destination, ancestors = new Set()) {
  const real = fs.realpathSync(source);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) { fs.copyFileSync(real, destination); return; }
  if (ancestors.has(real)) throw new Error(`Circular standalone dependency: ${source}`);
  const next = new Set(ancestors).add(real);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(real)) copyTree(path.join(real, name), path.join(destination, name), next);
}
