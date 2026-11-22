import type { BrandAsset, BrandIdentity } from './brandIdentity';

export type AddBrandMedia = (projectId: string, assets: BrandAsset[]) => void;
export const PACK_TAG = 'icon-pack:';

export function getBrandIconPacks(assets: readonly BrandAsset[]) {
  const byName = new Map<string, BrandAsset[]>();
  for (const asset of assets) {
    if (asset.type !== 'icon') continue;
    for (const tag of new Set(asset.tags)) {
      if (!tag.startsWith(PACK_TAG)) continue;
      const name = tag.slice(PACK_TAG.length).trim();
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name)!.push(asset);
    }
  }
  return Array.from(byName, ([name, icons]) => ({ name, icons }));
}

/** Keep previously edited labels, licences and placements when a file is imported again. */
export function mergeBrandMedia(identity: BrandIdentity, incoming: readonly BrandAsset[]): BrandIdentity {
  const known = new Map([...identity.assets, ...identity.proofAssets].map(asset => [asset.id, asset]));
  const added: BrandAsset[] = [];
  for (const asset of incoming) {
    const previous = known.get(asset.id);
    if (previous) {
      if (previous.type !== asset.type || previous.path !== asset.path) {
        throw new Error('A different brand file already has this ID. Existing files were preserved.');
      }
      continue;
    }
    added.push(asset);
    known.set(asset.id, asset);
  }
  return added.length ? { ...identity, assets: [...identity.assets, ...added] } : identity;
}
