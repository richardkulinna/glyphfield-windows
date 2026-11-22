import type { BrandAsset } from './brandIdentity';
import { PACK_TAG } from './brandMedia';
import { MAX_EMBEDDED_IMAGE_BYTES, readEmbeddedImageFile } from './imageAssets';
import { crc32 } from './zipStore';

const iconFile = /\.(svg|png)$/i;
const zipLimit = 64 * 1024 * 1024;

// Read the central directory so ZIPs with data descriptors (including GitHub archives) work.
// Only image bytes enter the project; archive paths are never written to the filesystem.
async function* archiveIcons(file: File): AsyncGenerator<File> {
  if (file.size > zipLimit) throw new Error('Choose a ZIP under 64 MB or select its SVG and PNG files directly.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const u16 = (p: number) => view.getUint16(p, true);
  const u32 = (p: number) => view.getUint32(p, true);
  let end = bytes.length - 22;
  const earliest = Math.max(0, end - 65535);
  while (end >= earliest && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < earliest || u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) {
    throw new Error('Choose a complete, single-volume ZIP file.');
  }
  const count = u16(end + 10);
  let cursor = u32(end + 16);
  let total = 0;
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw new Error('The ZIP directory is incomplete.');
    const flags = u16(cursor + 8), method = u16(cursor + 10), checksum = u32(cursor + 16);
    const compressed = u32(cursor + 20), length = u32(cursor + 24), nameLength = u16(cursor + 28), local = u32(cursor + 42);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replaceAll('\\', '/');
    cursor += 46 + nameLength + u16(cursor + 30) + u16(cursor + 32);
    if (cursor > end) throw new Error('The ZIP directory is incomplete.');
    if (!iconFile.test(name) || name.split('/').some(part => !part || part.startsWith('.') || part === '__MACOSX')) continue;
    if (flags & 1 || ![0, 8].includes(method)) throw new Error('Extract encrypted or unsupported ZIP files before importing.');
    total += length;
    if (length > MAX_EMBEDDED_IMAGE_BYTES || total > zipLimit) throw new Error('Import this pack in smaller batches.');
    if (local + 30 > end || u32(local) !== 0x04034b50) throw new Error('An icon is missing from the ZIP.');
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    if (start + compressed > end) throw new Error('An icon is incomplete in the ZIP.');
    const blob = new Blob([bytes.subarray(start, start + compressed)]);
    let data: Uint8Array<ArrayBuffer>;
    if (method === 0) {
      if (length !== compressed) throw new Error('An icon has an incorrect size.');
      data = new Uint8Array(await blob.arrayBuffer());
    } else {
      data = new Uint8Array(length);
      const reader = blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      let offset = 0;
      try {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
          if (offset + chunk.value.byteLength > length) throw new Error('An icon exceeds its stated size.');
          data.set(chunk.value, offset);
          offset += chunk.value.byteLength;
        }
        if (offset !== length) throw new Error('An icon is incomplete.');
      } finally {
        await reader.cancel();
      }
    }
    if (crc32(data) !== checksum) throw new Error('A file in the icon pack did not pass its checksum.');
    yield new File([data], name.split('/').at(-1)!);
  }
}

export async function readBrandMedia(files: readonly File[], packName?: string): Promise<BrandAsset[]> {
  const pack = packName?.trim();
  if (packName !== undefined && (!pack || (PACK_TAG + pack).length > 60)) {
    throw new Error('Give this icon pack a name of 1–51 characters.');
  }
  const items: BrandAsset[] = [];
  async function prepare(file: File) {
    const image = await readEmbeddedImageFile(file);
    if (pack && !['image/svg+xml', 'image/png'].includes(image.mimeType)) throw new Error('Icon packs accept SVG and PNG images.');
    const label = image.name.slice(0, 200);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([pack ?? '', label, image.source])));
    const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    items.push({
      id: 'media-' + key, label, alt: label, path: image.source, surface: 'any',
      type: pack ? 'icon' : 'image', tags: pack ? ['icon', PACK_TAG + pack] : ['image'],
    });
  }
  for (const file of files) {
    if (pack && /\.zip$/i.test(file.name)) {
      for await (const icon of archiveIcons(file)) await prepare(icon);
    } else await prepare(file);
  }
  if (!items.length) throw new Error('No SVG or PNG icons were found in this selection.');
  return items;
}
