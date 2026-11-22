/**
 * An explicit device drawing leads the identity. Older projects retain their
 * cover-tagged artwork or identity-field asset.
 */
import type { BrandAsset, BrandIdentity } from './brandIdentity';

const COVER_TYPES: ReadonlySet<BrandAsset['type']> = new Set(['background', 'image', 'motion', 'product', 'texture']);

/** True for a visual asset that an identity names as its signature art. */
export function isBrandCoverAsset(asset: Pick<BrandAsset, 'id' | 'tags' | 'type'>): boolean {
  return COVER_TYPES.has(asset.type) && (asset.id === 'identity-field' || Boolean(asset.tags?.includes('cover')));
}

type DeviceIdentity = Pick<BrandIdentity, 'assets'> & Partial<Pick<BrandIdentity, 'graphicSystem'>>;

export function isDeviceArtwork(asset: BrandAsset): boolean {
  const localImage = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml|avif|bmp)(?:;|,)/i.test(asset.path)
    || (/^\/(?![\/\\])/.test(asset.path) && !asset.path.includes('\\') && /\.(?:svg|png|jpe?g|gif|webp|avif|bmp)(?:[?#]|$)/i.test(asset.path));
  return localImage && (COVER_TYPES.has(asset.type) || asset.type === 'icon')
    && asset.redistribution !== 'research-only' && asset.redistribution !== 'url-only';
}

export function brandDeviceAsset(identity: DeviceIdentity, colorId?: string): BrandAsset | undefined {
  const system = identity.graphicSystem;
  if (!system?.assetId) return undefined;
  const assets = identity.assets ?? [];
  const variant = colorId && system.variants?.find((entry) => entry.colorId === colorId);
  const find = (id: string) => assets.find((asset) => asset.id === id && isDeviceArtwork(asset));
  return (variant ? find(variant.assetId) : undefined) ?? find(system.assetId);
}

export function brandCoverAsset(identity: DeviceIdentity): BrandAsset | undefined {
  const device = brandDeviceAsset(identity);
  if (device) return device;
  const assets = (Array.isArray(identity.assets) ? identity.assets : []).filter((asset) => isBrandCoverAsset(asset) && asset.redistribution !== 'research-only' && asset.redistribution !== 'url-only');
  return assets.find(({ tags }) => tags?.includes('cover')) ?? assets.find(({ id }) => id === 'identity-field');
}
