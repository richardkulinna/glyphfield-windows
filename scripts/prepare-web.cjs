const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'vendor');
// A build-only change. Never modify the upstream repository or its source history.
const file = path.join(vendor, 'next.config.ts');
const source = fs.readFileSync(file, 'utf8');
const anchor = 'const nextConfig: NextConfig = {';
if (source.split(anchor).length !== 2 || /output\s*:\s*['"]/.test(source)) {
  throw new Error('Upstream Next configuration changed. Review the desktop adapter before releasing.');
}
fs.writeFileSync(file, source.replace(anchor, `${anchor}\n  output: 'standalone',\n  outputFileTracingRoot: process.cwd(),\n  turbopack: { root: process.cwd() },`));

require('./apply-studio.cjs');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: vendor, encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify({ upstream: sha, builtAt: new Date().toISOString() }, null, 2));
