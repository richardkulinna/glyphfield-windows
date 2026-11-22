import { brandFontAssets, type BrandAsset, type BrandFontAsset, type BrandIdentity } from './brandIdentity';
import { brandTokenName } from './brandTokens';

export function extensionFor(path: string): string {
  const mime = path.match(/^data:([^;,]+)/i)?.[1]?.toLowerCase();
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime) return mime.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin';
  return path.split(/[?#]/)[0]?.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase() ?? 'bin';
}

export function brandLogoFileName(asset: { id: string; path: string }): string {
  return `logos/${brandTokenName(asset.id)}.${extensionFor(asset.path)}`;
}

function fontFileName(font: BrandFontAsset): string {
  const suffix = font.format === 'opentype' ? 'otf' : font.format === 'truetype' ? 'ttf' : font.format;
  const stem = font.fileName.replace(/\.(otf|ttf|woff2?)$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-');
  return `fonts/${stem || brandTokenName(font.id)}.${suffix}`;
}

function localFile(path: string): boolean {
  return /^data:/i.test(path) || /^\/(?![\\/])/.test(path);
}

// Use exact declarations. A sentence mentioning "not OFL" grants no packaging permission.
const INCLUDABLE_FONT_LICENSE = /^(?:(?:SIL )?Open Font Licen[sc]e(?:[ -](?:version )?1(?:\.0|\.1)?)?|OFL(?:[ -]1(?:\.0|\.1)?)?|Apache(?: License)?(?:[ -](?:Version )?2(?:\.0)?)?|MIT(?: License)?|CC0(?:[ -]1(?:\.0)?)?|Ubuntu Font Licen[sc]e(?:[ -]1\.0)?)$/i;

function packageableAsset(asset: BrandAsset, restrictedIds: ReadonlySet<string>, restrictedPaths: ReadonlySet<string>): boolean {
  return !restrictedIds.has(asset.id) && !restrictedPaths.has(asset.path) && localFile(asset.path)
    && ['original', 'bundled'].includes(asset.redistribution ?? 'original');
}

function uniquePath(preferred: string, used: Set<string>): string {
  let name = preferred;
  let suffix = 2;
  const dot = preferred.lastIndexOf('.');
  while (used.has(name.toLowerCase())) {
    name = `${preferred.slice(0, dot)}-${suffix++}${preferred.slice(dot)}`;
  }
  used.add(name.toLowerCase());
  return name;
}

export function brandKitManifest(identity: BrandIdentity) {
  const allAssets = [...identity.assets, ...identity.proofAssets];
  const restricted = (value: string | undefined) => value === 'url-only' || value === 'research-only';
  const restrictedIds = new Set(identity.references.filter((ref) => restricted(ref.redistribution)).map((ref) => ref.assetId).filter(Boolean) as string[]);
  const restrictedPaths = new Set(allAssets.filter((asset) => restricted(asset.redistribution) || restrictedIds.has(asset.id)).map((asset) => asset.path));
  const used = new Set<string>();
  const assets = allAssets.filter((asset) => packageableAsset(asset, restrictedIds, restrictedPaths)).map((asset) => ({
    asset,
    name: uniquePath(asset.type === 'logo' ? brandLogoFileName(asset) : `artwork/${brandTokenName(asset.id)}.${extensionFor(asset.path)}`, used),
  }));
  const usedFonts = new Set(identity.typography.map((role) => role.fontId));
  const fonts = brandFontAssets(identity).map((font) => ({
    font,
    name: uniquePath(fontFileName(font), used),
    include: usedFonts.has(font.id) && localFile(font.path) && !restrictedPaths.has(font.path) && INCLUDABLE_FONT_LICENSE.test(font.license?.trim() ?? ''),
  }));
  return { assets, fonts };
}

export function brandKitIncludedFonts(identity: BrandIdentity) {
  return brandKitManifest(identity).fonts.filter((row) => row.include).map((row) => row.font);
}

export function brandKitArtworkAssets(identity: BrandIdentity) {
  return brandKitManifest(identity).assets.map((row) => row.asset).filter((asset) => asset.type !== 'logo');
}

export function brandKitLogoAssets(identity: BrandIdentity) {
  return brandKitManifest(identity).assets.map((row) => row.asset).filter((asset) => asset.type === 'logo');
}

export function brandKitFontFaces(identity: BrandIdentity): string[] {
  const assigned = new Set(identity.typography.map((role) => role.fontId));
  return brandKitManifest(identity).fonts.filter(({ font }) => assigned.has(font.id)).map(({ font, name, include }) => {
    const weight = font.weightMin !== undefined && font.weightMax !== undefined ? `${font.weightMin} ${font.weightMax}` : String(font.weight);
    const rule = `@font-face {\n  font-family: ${JSON.stringify(font.family)};\n  src: url(${JSON.stringify(`../${name}`)}) format(${JSON.stringify(font.format)});\n  font-style: ${font.style};\n  font-weight: ${weight};\n  font-display: swap;\n}`;
    return include ? rule : `/* ${font.label.replace(/\*\//g, '')} is not included. Supply a separately licensed file at ${name}. */\n${rule}`;
  });
}

/** For a shared kit retain asset metadata and packaged paths without copying local binary payloads. */
export function shareableBrandSource(identity: BrandIdentity, preserveSourcePaths = false, authored = identity): BrandIdentity {
  const manifest = brandKitManifest(identity);
  const paths = new Map(manifest.assets.map(({ asset, name }) => [asset, name]));
  const fonts = new Map(manifest.fonts.filter(({ include }) => include).map(({ font, name }) => [font.id, name]));
  function portablePath(path: string, packaged: string | undefined): string {
    if (preserveSourcePaths && !/^data:/i.test(path)) return path;
    return packaged ?? (/^https?:\/\//i.test(path) ? path : '');
  }
  // HTTP accepts older, sparse identities. Use resolved records to locate their
  // kit files, and retain the exact values and keys supplied by the author.
  const assetViews = (records: BrandAsset[], resolved: BrandAsset[]) => records.map((asset, index) => ({
    ...asset, path: portablePath(asset.path, paths.get(resolved[index]!)),
  }));
  return {
    ...authored,
    assets: assetViews(authored.assets, identity.assets),
    ...(authored.proofAssets ? { proofAssets: assetViews(authored.proofAssets, identity.proofAssets) } : {}),
    ...(authored.fonts ? { fonts: authored.fonts.map((font) => ({ ...font, path: portablePath(font.path, fonts.get(font.id)) })) } : {}),
    ...(authored.motion ? { motion: authored.motion.map((entry) => {
      if (!/^data:/i.test(entry.previewPath)) return entry;
      const file = manifest.assets.find(({ asset }) => asset.path === entry.previewPath);
      return { ...entry, previewPath: portablePath(entry.previewPath, file?.name) };
    }) } : {}),
  };
}

/** Tool drafts can contain media inside saved SVG, CSS or serialized editor documents. */
export function printableSource(value: unknown, packagedFiles?: ReadonlyMap<string, string>): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== 'string' || !item.toLowerCase().includes('data:')) return item;
    // "data:text/plain,hello" in a written instruction or code example is text.
    // Only externalize media; first resolve whole URLs, including SVG with spaces.
    const packaged = packagedFiles?.get(item);
    if (packaged) return packaged;
    const media = /data:((?:image|font|video|audio|model)\/[\w.+-]+|application\/(?:octet-stream|pdf|font[\w.+-]*|vnd\.ms-fontobject))(?:;[\w=.+-]+)*,[^\s"'<>\\)`]+/gi;
    return item.replace(media, (uri: string, mime: string) => packagedFiles?.get(uri) ?? `[embedded ${mime}; file not packaged]`);
  }, 2) ?? 'null';
}

