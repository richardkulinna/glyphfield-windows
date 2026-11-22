import type { BrandFontAsset } from './brandIdentity';
import { readFontFamilyName } from './fontAxes';
import { downloadBlob } from './download';
import {
  serializePowerPoint,
  POWERPOINT_MIME,
  type Ink,
  type SlideBox,
  type SlideObject,
  type PowerPointPage,
  type PictureEffects,
} from './bookPowerPointPackage';
import { canvasFiles, imageFiles, inlineGraphicFiles, pictureFit, type PictureFiles } from './bookPowerPointImages';

const CLEAR: Ink = { hex: '000000', alpha: 0 };
const units = (s: string) => parseFloat(s) || 0;
type Bounds = { left: number; top: number; right: number; bottom: number };
function overlap(box: Bounds, clip: Bounds) {
  return box.right > clip.left && box.left < clip.right && box.bottom > clip.top && box.top < clip.bottom;
}
function intersect(box: Bounds, clip: Bounds): Bounds {
  return {
    left: Math.max(box.left, clip.left),
    top: Math.max(box.top, clip.top),
    right: Math.min(box.right, clip.right),
    bottom: Math.min(box.bottom, clip.bottom),
  };
}
function toBox(rect: Bounds, origin: DOMRect): SlideBox {
  return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.right - rect.left, h: rect.bottom - rect.top };
}
function inkReader() {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context) throw Error('Could not read the brand colours.');
  const colors = new Map<string, Ink>();
  return (css: string, opacity: number): Ink => {
    let ink = colors.get(css);
    if (!ink) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      ink = {
        hex: [r, g, b]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase(),
        alpha: a / 255,
      };
      colors.set(css, ink);
    }
    return opacity === 1 ? ink : { hex: ink.hex, alpha: ink.alpha * opacity };
  };
}
type ColorReader = ReturnType<typeof inkReader>;
function label(el: Element) {
  return (
    el.getAttribute('data-pptx-name') ||
    el.getAttribute('alt') ||
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.textContent?.trim().slice(0, 48) ||
    el.localName
  )
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function addSurfaces(
  el: Element,
  style: CSSStyleDeclaration,
  box: SlideBox,
  alpha: number,
  ink: ColorReader,
  output: SlideObject[],
) {
  const fill = ink(style.backgroundColor, alpha);
  const title = label(el);
  const rounded = units(style.borderTopLeftRadius);
  const geometry = rounded
    ? (style.borderTopLeftRadius.endsWith('%') && rounded >= 50) || rounded >= Math.min(box.w, box.h) * 0.5
      ? 'ellipse'
      : 'roundRect'
    : 'rect';
  const sides = ['top', 'right', 'bottom', 'left'].map((side, i) => ({
    i,
    width: units(style.getPropertyValue('border-' + side + '-width')),
    paint: ink(style.getPropertyValue('border-' + side + '-color'), alpha),
    mode: style.getPropertyValue('border-' + side + '-style'),
  }));
  if (fill.alpha) output.push({ ...box, kind: 'shape', name: title + ' · fill', geometry, fill });
  const frame = (name: string, frameBox: SlideBox, width: number, color: Ink, mode: string) => {
    if (width > 0 && color.alpha > 0)
      output.push({
        ...frameBox,
        kind: 'shape',
        name: title + ' · ' + name,
        geometry,
        fill: CLEAR,
        line: { ink: color, width, dashed: mode === 'dashed' || mode === 'dotted' },
      });
  };
  const [first] = sides;
  if (
    first.width > 0 &&
    sides.every(
      (s) =>
        s.width === first.width &&
        s.paint.hex === first.paint.hex &&
        s.paint.alpha === first.paint.alpha &&
        s.mode === first.mode,
    )
  ) {
    frame(
      'border',
      {
        x: box.x + first.width / 2,
        y: box.y + first.width / 2,
        w: Math.max(0, box.w - first.width),
        h: Math.max(0, box.h - first.width),
      },
      first.width,
      first.paint,
      first.mode,
    );
  } else {
    for (const { i, width, paint } of sides) {
      if (!width || !paint.alpha) continue;
      const rect = { ...box };
      if (i % 2 === 0) {
        rect.h = width;
        if (i === 2) rect.y += box.h - width;
      } else {
        rect.w = width;
        if (i === 1) rect.x += box.w - width;
      }
      output.push({
        ...rect,
        kind: 'shape',
        name: title + ' · ' + ['top', 'right', 'bottom', 'left'][i] + ' rule',
        fill: paint,
      });
    }
  }
  if (style.outlineStyle !== 'none') {
    const width = units(style.outlineWidth),
      gap = units(style.outlineOffset) + width / 2;
    frame(
      'outline',
      { x: box.x - gap, y: box.y - gap, w: box.w + 2 * gap, h: box.h + 2 * gap },
      width,
      ink(style.outlineColor, alpha),
      style.outlineStyle,
    );
  }
}

function visualText(text: string, style: CSSStyleDeclaration) {
  let value = text;
  if (!/pre|break-spaces/.test(style.whiteSpace)) value = value.replace(/\s+/g, ' ');
  if (style.textTransform === 'uppercase') return value.toLocaleUpperCase();
  if (style.textTransform === 'lowercase') return value.toLocaleLowerCase();
  return value;
}
function textObjects(
  node: Text,
  style: CSSStyleDeclaration,
  clip: Bounds,
  origin: DOMRect,
  alpha: number,
  ink: ColorReader,
) {
  const value = node.data;
  if (!value.trim()) return [];
  const range = document.createRange();
  range.selectNodeContents(node);
  const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  const result: SlideObject[] = [];
  function add(str: string, rect: DOMRect) {
    if (!overlap(rect, clip)) return;
    const text = visualText(str, style).trim();
    if (!text) return;
    let font = style.fontFamily
      .split(',')[0]
      .trim()
      .replace(/^["']|["']$/g, '');
    if (/^(system-ui|ui-sans-serif|sans-serif)$/i.test(font)) font = 'Arial';
    if (/^(monospace|ui-monospace)$/i.test(font)) font = 'Consolas';
    if (/^(ui-serif|serif)$/i.test(font)) font = 'Georgia';
    result.push({
      ...toBox(rect, origin),
      kind: 'text',
      name: text.slice(0, 70),
      text,
      font,
      size: units(style.fontSize),
      bold: Number(style.fontWeight) >= 600 || style.fontWeight === 'bold',
      italic: /italic|oblique/.test(style.fontStyle),
      spacing: units(style.letterSpacing),
      ink: ink(style.color, alpha),
      underline: style.textDecorationLine.includes('underline'),
    });
  }
  if (lines.length === 1) {
    add(value, lines[0]);
    return result;
  }
  // Native text boxes follow the actual line breaks and inline spans, preserving the browser's composed layout.
  let start = -1,
    end = 0,
    lastY = -Infinity;
  const flush = () => {
    if (start < 0) return;
    range.setStart(node, start);
    range.setEnd(node, end);
    add(value.slice(start, end), range.getBoundingClientRect());
  };
  for (const m of value.matchAll(/\S+/gu)) {
    const index = m.index ?? 0;
    range.setStart(node, index);
    range.setEnd(node, index + m[0].length);
    const rects = Array.from(range.getClientRects());
    if (rects.length > 1) {
      // Break-word and CJK strings can wrap without whitespace.
      flush();
      start = -1;
      let offset = index;
      for (const ch of m[0]) {
        range.setStart(node, offset);
        range.setEnd(node, offset + ch.length);
        const y = range.getBoundingClientRect().y;
        if (start < 0 || Math.abs(y - lastY) > 0.5) {
          flush();
          start = offset;
          lastY = y;
        }
        end = offset + ch.length;
        offset = end;
      }
    } else {
      const y = rects[0]?.y ?? lastY;
      if (start < 0 || Math.abs(y - lastY) > 0.5) {
        flush();
        start = index;
        lastY = y;
      }
      end = index + m[0].length;
    }
  }
  flush();
  return result;
}

type Capture = { ink: ColorReader; media: Map<string, Promise<PictureFiles>>; missing: Set<string> };
function pictureEffects(filters: string[], ink: ColorReader): PictureEffects {
  const effects: PictureEffects = {};
  const css = filters.join(' ');
  if (/brightness\(0(?:%)?\)/.test(css)) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.filter = css;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 1, 1);
      effects.tint = Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3), (c) => c.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    }
  }
  const shadows = Array.from(css.matchAll(/drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g), (m) => {
    const input = m[1],
      sizes = Array.from(input.matchAll(/(-?[\d.]+)px/g), (entry) => Number(entry[1]));
    const color = input.replace(/-?[\d.]+px/g, '').trim();
    return { x: sizes[0] || 0, y: sizes[1] || 0, blur: sizes[2] || 0, ink: ink(color || 'black', 1) };
  });
  if (shadows.length === 1) effects.shadow = shadows[0];
  else if (shadows.length > 1)
    effects.glow = { radius: Math.max(...shadows.map((s) => Math.hypot(s.x, s.y) + s.blur)), ink: shadows[0].ink };
  return effects;
}
function paintOrder(parent: Element): ChildNode[] {
  return Array.from(parent.childNodes)
    .map((node, index) => {
      const element = node instanceof Element ? node : null;
      const style = element ? getComputedStyle(element) : null;
      const z = style?.position !== 'static' ? Number(style?.zIndex) || 0 : 0;
      return { node, index, z };
    })
    .sort((a, b) => a.z - b.z || a.index - b.index)
    .map((item) => item.node);
}
async function capturePage(page: HTMLElement, session: Capture): Promise<PowerPointPage> {
  const rect = page.getBoundingClientRect();
  const objects: SlideObject[] = [];
  async function visit(el: Element, clip: Bounds, opacity: number) {
    const style = getComputedStyle(el);
    if (
      el.matches('script,style,[hidden],[data-pptx-ignore]') ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.clipPath === 'inset(50%)'
    )
      return;
    const alpha = opacity * Number(style.opacity);
    if (alpha === 0) return;
    const frame = el.getBoundingClientRect();
    const box = toBox(frame, rect);
    const visible = overlap(frame, clip);
    if (visible) addSurfaces(el, style, box, alpha, session.ink, objects);
    if (el instanceof HTMLImageElement || el instanceof SVGSVGElement || el instanceof HTMLCanvasElement) {
      if (!visible) return;
      const name = label(el);
      try {
        let files: PictureFiles;
        let bounds: { box: SlideBox; crop?: number[] } = { box };
        if (el instanceof HTMLImageElement) {
          const url = el.currentSrc || el.src;
          if (!url || !el.naturalWidth) throw Error('Unavailable image');
          const reused = session.media.get(url) ?? imageFiles(el);
          session.media.set(url, reused);
          files = await reused;
          bounds = pictureFit(box, el.naturalWidth, el.naturalHeight, style.objectFit, style.objectPosition);
        } else if (el instanceof SVGSVGElement) {
          files = await inlineGraphicFiles(el);
        } else {
          files = await canvasFiles(el);
        }
        let matrix = new DOMMatrix();
        const filters: string[] = [];
        for (let ancestor: Element | null = el; ancestor && ancestor !== page; ancestor = ancestor.parentElement) {
          const computed = getComputedStyle(ancestor),
            transform = computed.transform;
          if (computed.filter !== 'none') filters.push(computed.filter);
          if (transform !== 'none') matrix = new DOMMatrix(transform).multiply(matrix);
        }
        const flipH = matrix.a * matrix.d - matrix.b * matrix.c < 0;
        const rotation = (Math.atan2(flipH ? -matrix.b : matrix.b, flipH ? -matrix.a : matrix.a) * 180) / Math.PI;
        if (!matrix.isIdentity && el instanceof HTMLImageElement) {
          const sx = Math.hypot(matrix.a, matrix.b),
            sy = Math.hypot(matrix.c, matrix.d);
          const original = pictureFit(
            { x: 0, y: 0, w: el.offsetWidth, h: el.offsetHeight },
            el.naturalWidth,
            el.naturalHeight,
            style.objectFit,
            style.objectPosition,
          );
          bounds = {
            crop: original.crop,
            box: {
              x: box.x + (box.w - el.offsetWidth * sx) / 2 + original.box.x * sx,
              y: box.y + (box.h - el.offsetHeight * sy) / 2 + original.box.y * sy,
              w: original.box.w * sx,
              h: original.box.h * sy,
            },
          };
        }
        if (!rotation && !flipH) {
          const b = bounds.box,
            bRect = {
              left: rect.left + b.x,
              top: rect.top + b.y,
              right: rect.left + b.x + b.w,
              bottom: rect.top + b.y + b.h,
            };
          if (!overlap(bRect, clip)) return;
          const cropped = intersect(bRect, clip);
          const [l, t, r, bt] = bounds.crop ?? [0, 0, 0, 0],
            rawW = 1 - l - r,
            rawH = 1 - t - bt;
          if (
            cropped.left !== bRect.left ||
            cropped.top !== bRect.top ||
            cropped.right !== bRect.right ||
            cropped.bottom !== bRect.bottom
          )
            bounds = {
              box: toBox(cropped, rect),
              crop: [
                l + ((cropped.left - bRect.left) * rawW) / b.w,
                t + ((cropped.top - bRect.top) * rawH) / b.h,
                r + ((bRect.right - cropped.right) * rawW) / b.w,
                bt + ((bRect.bottom - cropped.bottom) * rawH) / b.h,
              ],
            };
        }
        objects.push({
          ...bounds.box,
          kind: 'picture',
          name,
          ...files,
          alpha,
          crop: bounds.crop,
          rotation,
          flipH,
          gray: filters.some((f) => /grayscale\((1|100%)\)/.test(f)),
          ...pictureEffects(filters, session.ink),
        });
      } catch {
        session.missing.add(name);
      }
      return;
    }
    const clips = /(hidden|clip|scroll|auto)/.test(style.overflowX + ' ' + style.overflowY);
    if (clips && !visible) return;
    const inner = clips ? intersect(frame, clip) : clip;
    for (const node of paintOrder(el)) {
      if (node instanceof Text) objects.push(...textObjects(node, style, inner, rect, alpha, session.ink));
      else if (node instanceof Element) await visit(node, inner, alpha);
    }
  }
  await visit(page, rect, 1);
  return { title: page.getAttribute('aria-label') || 'Brand book', width: rect.width, height: rect.height, objects };
}

export async function buildBookPowerPoint(board: HTMLElement, fonts: readonly BrandFontAsset[] = []) {
  const pages = Array.from(board.querySelectorAll<HTMLElement>('[data-book-page]')).filter(
    (p) => !p.closest('[data-hidden="true"]'),
  );
  if (!pages.length) throw Error('No visible pages in the brand book.');
  const session: Capture = { ink: inkReader(), media: new Map(), missing: new Set() };
  // Offscreen auto-contained thumbnails can report zero descendant bounds. Measure at a fixed editorial width.
  const style = document.createElement('style');
  style.textContent =
    '[data-pptx-measure] { --book-thumb-width: 1000px !important } [data-pptx-measure] button:has([data-book-page]) { content-visibility:visible !important; width:1000px !important }';
  board.setAttribute('data-pptx-measure', '');
  document.head.append(style);
  try {
    await document.fonts.ready;
    const slides: PowerPointPage[] = [];
    for (const page of pages) slides.push(await capturePage(page, session));
    const desktopNames = new Map<string, string>();
    await Promise.all(fonts.map(async font => {
      try {
        const url = new URL(font.path, document.baseURI);
        if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== location.origin) return;
        const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) return;
        const desktop = await readFontFamilyName(await response.arrayBuffer());
        if (desktop) desktopNames.set(font.family, desktop);
      } catch { /* A linked or unreadable font retains its configured family. */ }
    }));
    for (const slide of slides) {
      for (const object of slide.objects) {
        if (object.kind === 'text') object.font = desktopNames.get(object.font) ?? object.font;
      }
    }
    const bytes = serializePowerPoint(slides);
    return { blob: new Blob([new Uint8Array(bytes)], { type: POWERPOINT_MIME }), missing: [...session.missing] };
  } finally {
    style.remove();
    board.removeAttribute('data-pptx-measure');
  }
}

export async function exportBookPowerPoint(board: HTMLElement, brandName: string, fonts: readonly BrandFontAsset[] = []): Promise<string[]> {
  const { blob, missing } = await buildBookPowerPoint(board, fonts);
  const filename = brandName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'Glyphfield';
  downloadBlob(blob, filename + '-Brandbook.pptx');
  return missing;
}
