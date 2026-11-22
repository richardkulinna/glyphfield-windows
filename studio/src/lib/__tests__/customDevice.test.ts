import { describe, expect, it } from 'vitest';
import { brandCoverAsset, brandDeviceAsset } from '../brandCover';
import { createBrandIdentity, type BrandAsset } from '../brandIdentity';
import { upsertBrandAsset, upsertBrandFont } from '../brandIdentityActions';
import { brandDeviceMarkup } from '../brandOutputKit';
import { applyBrandIdentitySource, validateBrandIdentitySource } from '../brandSource';
import { starterKitPatch } from '../brandStarterKit';

const image = (id: string): BrandAsset => ({
  id, label: id, path: `/${id}.svg`, redistribution: 'original', surface: 'any', type: 'image',
});
const identity = createBrandIdentity('Willow', 'willow');
const first = image('original-ribbon');
const second = image('green-ribbon');
const system = { ...identity.graphicSystem, assetId: first.id, variants: [{ assetId: second.id, colorId: identity.colors[0]!.id }] };
const brand = { ...identity, assets: [first, second], graphicSystem: system };
const size = { height: 160, prefix: 'test', width: 320 };

describe('uploaded device artwork', () => {
  it('uses the original file for the preview, cover and vector output including a matching palette variant', () => {
    expect(brandCoverAsset(brand)).toBe(first);
    expect(brandDeviceMarkup(brand, size)).toContain('href="/original-ribbon.svg"');
    expect(brandDeviceMarkup(brand, { ...size, colorId: identity.colors[0]!.id })).toContain('href="/green-ribbon.svg"');
    expect(brandDeviceMarkup(brand, size)).toContain('preserveAspectRatio="xMidYMid meet"');
  });
  it('retains device references in source and falls back when artwork is restricted, removed or the built-in drawing is selected', () => {
    const applied = applyBrandIdentitySource(identity, { assets: [first, second], graphicSystem: system }).identity;
    expect(applied.graphicSystem.variants).toEqual(system.variants);
    expect(brandDeviceAsset({ ...brand, assets: [{ ...first, redistribution: 'research-only' }] })).toBeUndefined();
    expect(brandDeviceAsset({ ...brand, assets: [{ ...first, path: 'https://example.org/picture.svg' }] })).toBeUndefined();
    expect(validateBrandIdentitySource({ ...brand, assets: [] }).issues.some(({ path }) => path === 'graphicSystem.assetId')).toBe(true);
    expect(brandDeviceAsset({ ...brand, ...starterKitPatch(brand, { device: 'wave' }) })).toBeUndefined();
  });
  it('merges imported files and role assignments into the latest edit', () => {
    const afterFirst = upsertBrandAsset({ ...identity, name: 'Edited during import' }, first);
    const afterBoth = upsertBrandAsset(afterFirst, second);
    const font = identity.fonts![0]!;
    const afterFont = upsertBrandFont(afterBoth, { ...font, id: 'uploaded-face' }, new Set(['Display']));
    expect(afterFont.assets.slice(-2)).toEqual([first, second]);
    expect(afterFont.name).toBe('Edited during import');
    expect(afterFont.typography.find(({ role }) => role === 'Display')?.fontId).toBe('uploaded-face');
  });
});
