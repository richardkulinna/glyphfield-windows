import type { BrandIdentity } from './brandIdentity';
import { brandCssVariables, brandDesignTokens, brandTailwindTheme } from './brandTokens';
import { brandGuidelinesMarkdown } from './brandGuidelinesMarkdown';
import { brandKitManifest, brandKitFontFaces, extensionFor, printableSource, shareableBrandSource } from './brandKitManifest';
export { brandKitFontFaces, brandKitIncludedFonts, brandKitArtworkAssets, brandKitLogoAssets, brandLogoFileName } from './brandKitManifest';
export { brandGuidelinesMarkdown } from './brandGuidelinesMarkdown';
import { createStoredZip, type ZipEntry } from './zipStore';

/**
 * Brand kit export: the token files from brandTokens.ts (DTCG JSON, CSS custom
 * properties, Tailwind CSS v4 `@theme`), a `brand.md` written for coding agents,
 * the logo pack, redistributable artwork, licensed font files, and one
 * store-only ZIP holding all of them.
 */
export const BRAND_KIT_FORMATS = ['zip', 'dtcg', 'css', 'tailwind', 'markdown', 'logos'] as const;
export type BrandKitFormat = (typeof BRAND_KIT_FORMATS)[number];

export const BRAND_KIT_FILE_NAMES: Record<Exclude<BrandKitFormat, 'logos' | 'zip'>, string> = {
  css: 'tokens/brand.css',
  dtcg: 'tokens/tokens.json',
  markdown: 'brand.md',
  tailwind: 'tokens/tailwind.css',
};

export function brandKitSlug(identity: BrandIdentity): string {
  return identity.name
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'brand';
}

export type BrandKitFile = {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
};

function textFile(name: string, mimeType: string, content: string): BrandKitFile {
  return { bytes: new TextEncoder().encode(content), mimeType, name };
}

export function brandKitTextFile(identity: BrandIdentity, format: Exclude<BrandKitFormat, 'logos' | 'zip'>, project?: unknown, authored = identity): BrandKitFile {
  if (format === 'dtcg') return textFile(BRAND_KIT_FILE_NAMES.dtcg, 'application/json', `${JSON.stringify(brandDesignTokens(identity), null, 2)}\n`);
  const fontFaces = brandKitFontFaces(identity);
  if (format === 'css') return textFile(BRAND_KIT_FILE_NAMES.css, 'text/css', brandCssVariables(identity, { fontFaces }));
  if (format === 'tailwind') return textFile(BRAND_KIT_FILE_NAMES.tailwind, 'text/css', brandTailwindTheme(identity, { fontFaces }));
  return textFile(BRAND_KIT_FILE_NAMES.markdown, 'text/markdown', brandGuidelinesMarkdown(identity, project, authored));
}

/** Decode a data: URL into bytes without a network request. */
export function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) throw new TypeError('Expected a data: URL.');
  const metadata = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  if (/;base64$/i.test(metadata)) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

export type BrandKitFileLoader = (path: string) => Promise<Uint8Array>;

async function loadPath(path: string, load: BrandKitFileLoader): Promise<Uint8Array> {
  return path.startsWith('data:') ? dataUrlBytes(path) : load(path);
}

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp',
};

async function assetFiles(identity: BrandIdentity, load: BrandKitFileLoader, logosOnly = false): Promise<BrandKitFile[]> {
  const rows = brandKitManifest(identity).assets.filter(({ asset }) => !logosOnly || asset.type === 'logo');
  return Promise.all(rows.map(async ({ asset, name }) => ({
    bytes: await loadPath(asset.path, load),
    mimeType: asset.path.match(/^data:([^;,]+)/)?.[1] ?? IMAGE_MIME_TYPES[extensionFor(asset.path)] ?? 'application/octet-stream',
    name,
  })));
}

export function brandLogoFiles(identity: BrandIdentity, load: BrandKitFileLoader): Promise<BrandKitFile[]> {
  return assetFiles(identity, load, true);
}

export async function brandKitFiles(identity: BrandIdentity, load: BrandKitFileLoader, project?: unknown): Promise<BrandKitFile[]> {
  const fonts = await Promise.all(brandKitManifest(identity).fonts.filter(({ include }) => include).map(async ({ font, name }) => ({
    bytes: await loadPath(font.path, load),
    mimeType: `font/${font.format === 'opentype' ? 'otf' : font.format === 'truetype' ? 'ttf' : font.format}`,
    name,
  })));
  return [
    brandKitTextFile(identity, 'markdown', project),
    brandKitTextFile(identity, 'dtcg'),
    brandKitTextFile(identity, 'css'),
    brandKitTextFile(identity, 'tailwind'),
    textFile('identity.json', 'application/json', printableSource(shareableBrandSource(identity)) + '\n'),
    ...(await assetFiles(identity, load)),
    ...fonts,
  ];
}

export function brandKitZip(identity: BrandIdentity, files: readonly BrandKitFile[], modified?: Date): Uint8Array {
  const folder = `${brandKitSlug(identity)}-brand-kit`;
  const entries: ZipEntry[] = files.map((file) => ({ bytes: file.bytes, name: `${folder}/${file.name}` }));
  return createStoredZip(entries, modified);
}
