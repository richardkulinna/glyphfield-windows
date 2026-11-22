import { svgToPngBlob } from './download';
import type { Media, SlideBox } from './bookPowerPointPackage';

export type PictureFiles = { media: Media; vector?: Media };
const encoded = new TextEncoder();
const data = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

async function canvasPng(canvas: HTMLCanvasElement): Promise<Media> {
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((value) => (value ? res(value) : rej(Error('Image could not be encoded.'))), 'image/png'),
  );
  return { ext: 'png', bytes: await data(blob) };
}

export async function canvasFiles(canvas: HTMLCanvasElement): Promise<PictureFiles> {
  return { media: await canvasPng(canvas) };
}

async function svgFiles(markup: string, width: number, height: number): Promise<PictureFiles> {
  // Drawing tools can prepend an external SVG 1.1 DTD. Presentations need only the drawing.
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (parsed.documentElement.localName !== 'svg' || parsed.querySelector('parsererror'))
    throw Error('Invalid SVG file.');
  const vector = new XMLSerializer().serializeToString(parsed.documentElement);
  const png = await svgToPngBlob(vector, Math.max(1, width), Math.max(1, height));
  return { media: { ext: 'png', bytes: await data(png) }, vector: { ext: 'svg', bytes: encoded.encode(vector) } };
}

/** Inline computed presentation properties so source CSS, currentColor and brand tokens survive offline. */
export async function inlineGraphicFiles(svg: SVGSVGElement): Promise<PictureFiles> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const props = [
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'opacity',
    'color',
    'stop-color',
    'stop-opacity',
    'font-family',
    'font-size',
    'font-weight',
    'text-anchor',
    'dominant-baseline',
    'visibility',
    'display',
    'clip-path',
    'mask',
    'filter',
  ];
  const originals = [svg, ...svg.querySelectorAll('*')],
    copies = [copy, ...copy.querySelectorAll('*')];
  originals.forEach((el, i) => {
    const style = getComputedStyle(el);
    const dest = copies[i] as SVGElement;
    dest.removeAttribute('class');
    for (const prop of props) {
      const value = style.getPropertyValue(prop).replace(/url\(["']?[^()#]*#([^"')]+)["']?\)/g, 'url(#$1)');
      if (value) dest.style.setProperty(prop, value);
    }
  });
  const rect = svg.getBoundingClientRect();
  copy.setAttribute('width', String(Math.max(1, rect.width)));
  copy.setAttribute('height', String(Math.max(1, rect.height)));
  if (!copy.hasAttribute('viewBox'))
    copy.setAttribute('viewBox', '0 0 ' + Math.max(1, svg.clientWidth) + ' ' + Math.max(1, svg.clientHeight));
  return svgFiles(new XMLSerializer().serializeToString(copy), rect.width, rect.height);
}

export async function imageFiles(img: HTMLImageElement): Promise<PictureFiles> {
  const src = img.currentSrc || img.src;
  const result = await fetch(src, { signal: AbortSignal.timeout(8000) });
  if (!result.ok) throw Error('Image unavailable');
  const blob = await result.blob();
  const mime = blob.type.split(';')[0]?.toLowerCase();
  if (mime === 'image/svg+xml') return svgFiles(await blob.text(), img.naturalWidth || 256, img.naturalHeight || 256);
  if (['image/png', 'image/jpeg', 'image/gif'].includes(mime))
    return { media: { ext: mime.slice(6) as Media['ext'], bytes: await data(blob) } };
  // PowerPoint cannot open all browser formats. Convert this one picture, preserving all other objects.
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    return canvasFiles(canvas);
  } finally {
    bitmap.close();
  }
}

function position(part: string | undefined, span: number) {
  if (part === 'left' || part === 'top') return 0;
  if (part === 'right' || part === 'bottom') return span;
  if (part?.endsWith('%')) return (parseFloat(part) * span) / 100;
  if (part?.endsWith('px')) return parseFloat(part);
  return span / 2;
}
export function pictureFit(
  box: SlideBox,
  naturalW: number,
  naturalH: number,
  fit: string,
  objectPosition: string,
): { box: SlideBox; crop?: number[] } {
  if (!naturalW || !naturalH || fit === 'fill') return { box };
  const ratio =
    fit === 'cover'
      ? Math.max(box.w / naturalW, box.h / naturalH)
      : fit === 'none'
        ? 1
        : Math.min(fit === 'scale-down' ? 1 : Infinity, box.w / naturalW, box.h / naturalH);
  const w = naturalW * ratio,
    h = naturalH * ratio;
  const [xp, yp] = objectPosition.split(/\s+/);
  const dx = position(xp, box.w - w),
    dy = position(yp, box.h - h);
  const left = Math.max(0, -dx),
    top = Math.max(0, -dy),
    right = Math.max(0, w + dx - box.w),
    bottom = Math.max(0, h + dy - box.h);
  return {
    box: { x: box.x + Math.max(0, dx), y: box.y + Math.max(0, dy), w: w - left - right, h: h - top - bottom },
    crop: left || right || top || bottom ? [left / w, top / h, right / w, bottom / h] : undefined,
  };
}
