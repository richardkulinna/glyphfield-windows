const fs = require('node:fs');
const path = require('node:path');
// Specify the fixture input; retain the original assertion and all product code.
const file = path.resolve('vendor/src/lib/__tests__/brandTokens.test.ts');
const source = fs.readFileSync(file, 'utf8');
if (source.includes("expect(theme).toContain('--radius-brand: 6px;');")) {
  const anchor = "  ...createBrandIdentity('Acme Labs', 'acme'),";
  if (source.split(anchor).length !== 2) throw new Error('Upstream token fixture changed; review the test-only adapter.');
  fs.writeFileSync(file, source.replace(anchor, anchor + "\n  style: { ...createBrandIdentity('Acme Labs', 'acme').style, borderRadius: 6 },"));
}
