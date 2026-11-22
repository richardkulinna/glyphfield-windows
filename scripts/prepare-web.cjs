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

// Apply the Windows typography policy before Next hashes its production assets.
function replaceOnce(relative, before, after) {
  const filename = path.join(vendor, relative);
  const text = fs.readFileSync(filename, 'utf8');
  if (text.split(before).length !== 2) {
    throw new Error(`Review the Windows font-weight adapter: upstream changed ${relative}.`);
  }
  fs.writeFileSync(filename, text.replace(before, after));
}
replaceOnce('src/lib/typography.ts', 'MAX_VISIBLE_FONT_WEIGHT = 550;', 'MAX_VISIBLE_FONT_WEIGHT = 900;');
const views = 'src/components/tools/typography/TypographyViews.tsx';
replaceOnce(views, "import { capVisibleFontWeight }", "import { MAX_VISIBLE_FONT_WEIGHT, capVisibleFontWeight }");
replaceOnce(views,
  'Math.min(550, fonts.length ? Math.max(...fonts.map((font) => font.weightMax ?? font.weight)) : 550)',
  'Math.min(MAX_VISIBLE_FONT_WEIGHT, fonts.length ? Math.max(...fonts.map((font) => font.weightMax ?? font.weight)) : MAX_VISIBLE_FONT_WEIGHT)');
replaceOnce('src/lib/brandElements.ts',
  "Math.min(identity.typography.find(({ role }) => role === 'Display')?.weight ?? 550, 550)",
  "Math.min(identity.typography.find(({ role }) => role === 'Display')?.weight ?? 550, 900)");
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: vendor, encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify({ upstream: sha, builtAt: new Date().toISOString() }, null, 2));
