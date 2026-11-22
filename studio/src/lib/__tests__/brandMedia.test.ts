// @vitest-environment happy-dom
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { duplicateBrandIdentity, normalizeBrandIdentity, STARTER_BRAND_IDENTITY } from '../brandIdentity';
import { getBrandIconPacks, mergeBrandMedia } from '../brandMedia';
import { readBrandMedia } from '../importBrandMedia';
import { validateBrandIdentitySource } from '../brandSource';
import { createStoredZip } from '../zipStore';

const vector = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>');
function zipped() {
  return new Uint8Array(createStoredZip([
    { name: 'symbols/router.svg', bytes: vector },
    { name: 'symbols/telephone.svg', bytes: vector },
    { name: '__MACOSX/telephone.svg', bytes: vector },
    { name: 'LICENSE', bytes: new TextEncoder().encode('Test fixture') },
  ]));
}

describe('portable brandbook media', () => {
  it('reads a stored ZIP, groups the pictured icons and retains files and pack metadata on duplicate / JSON restore', async () => {
    const icons = await readBrandMedia([new File([zipped()], 'example.zip')], 'Line icons');
    expect(icons.map(item => item.label)).toEqual(['router', 'telephone']);
    const saved = mergeBrandMedia(STARTER_BRAND_IDENTITY, icons);
    const copy = duplicateBrandIdentity(normalizeBrandIdentity(JSON.parse(JSON.stringify(saved))));
    expect(getBrandIconPacks(copy.assets).find(pack => pack.name === 'Line icons')?.icons).toEqual(icons);
    expect(icons.every(icon => icon.path.startsWith('data:image/svg+xml;base64,'))).toBe(true);
    const again = await readBrandMedia([new File([zipped()], 'copy.zip')], 'Line icons');
    expect(mergeBrandMedia(saved, again)).toBe(saved);
  });

  it('recognises deflated archives and reports damaged file contents', async () => {
    const name = 'camera.svg';
    const stored = createStoredZip([{ name, bytes: vector }]);
    const packed = deflateRawSync(vector);
    const start = 30 + name.length;
    const central = start + packed.byteLength;
    const archive = new Uint8Array(stored.length - vector.byteLength + packed.byteLength);
    archive.set(stored.subarray(0, start));
    archive.set(packed, start);
    archive.set(stored.subarray(start + vector.byteLength), central);
    const view = new DataView(archive.buffer);
    view.setUint16(8, 8, true);
    view.setUint16(central + 10, 8, true);
    view.setUint32(18, packed.byteLength, true);
    view.setUint32(central + 20, packed.byteLength, true);
    view.setUint32(archive.length - 6, central, true);
    const files = await readBrandMedia([new File([archive], 'deflated.zip')], 'Pack');
    expect(files.map(file => file.label)).toEqual(['camera']);
    view.setUint32(central + 16, 0, true);
    await expect(readBrandMedia([new File([archive], 'damaged.zip')], 'Pack')).rejects.toThrow(/checksum/);
  });

  it('accepts more than 160 icons in identity source and keeps distinct pack memberships', async () => {
    const file = new File([vector], 'camera.svg');
    const [a] = await readBrandMedia([file], 'Light');
    const [b] = await readBrandMedia([file], 'Dark');
    expect(a!.id).not.toBe(b!.id);
    const assets = Array.from({ length: 220 }, (_, i) => ({ ...a!, id: 'icon-' + i }));
    expect(validateBrandIdentitySource({ assets }, 'patch').ok).toBe(true);
    expect(getBrandIconPacks([a!, b!]).map(pack => pack.name)).toEqual(['Light', 'Dark']);
  });
});
