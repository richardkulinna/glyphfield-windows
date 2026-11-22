import { describe, expect, it } from 'vitest';
import { pictureFit } from '../bookPowerPointImages';
import { serializePowerPoint, type SlideObject } from '../bookPowerPointPackage';

// The existing ZIP writer stores uncompressed parts. Read their payloads independently.
function parts(bytes: Uint8Array) {
  const files = new Map<string, string>();
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let p = 0;
  while (data.getUint32(p, true) === 0x04034b50) {
    const length = data.getUint32(p + 18, true);
    const nameEnd = p + 30 + data.getUint16(p + 26, true);
    const start = nameEnd + data.getUint16(p + 28, true);
    const name = decoder.decode(bytes.subarray(p + 30, nameEnd));
    files.set(name, decoder.decode(bytes.subarray(start, start + length)));
    p = start + length;
  }
  return files;
}

describe('editable PowerPoint export', () => {
  const box = { x: 10, y: 20, w: 100, h: 100 };
  const ink = { hex: '0B1230', alpha: 1 };
  it('keeps text, shapes and vector pictures individually named in display order', () => {
    const objects: SlideObject[] = [
      { ...box, kind: 'shape', name: 'Swatch', fill: ink },
      {
        ...box,
        kind: 'text',
        name: 'Label',
        text: 'H&S',
        ink,
        font: 'Figtree',
        size: 20,
        bold: false,
        italic: false,
        spacing: 0,
      },
      {
        ...box,
        kind: 'picture',
        name: 'Logo',
        media: { ext: 'png', bytes: Uint8Array.of(1) },
        vector: { ext: 'svg', bytes: new TextEncoder().encode('<svg/>') },
        alpha: 1,
        tint: 'AA22BB',
        shadow: { x: 2, y: 4, blur: 3, ink },
      },
    ];
    const files = parts(
      serializePowerPoint(['First', 'Second'].map((title) => ({ title, width: 800, height: 600, objects }))),
    );
    const slide = files.get('ppt/slides/slide1.xml')!;
    expect(slide).toContain('<a:t>H&amp;S</a:t>');
    expect(slide).toMatch(/name="Swatch [^"]*"[\s\S]*name="Label [^"]*"[\s\S]*name="Logo [^"]*"/);
    expect(slide.match(/<p:sp>/g)).toHaveLength(2);
    expect(slide.match(/<p:pic>/g)).toHaveLength(1);
    expect(slide).toContain('<a:outerShdw');
    expect(slide).toContain('<a:duotone>');
    expect(slide).toContain('svgBlip');
    expect(files.get('ppt/slides/slide2.xml')).toContain('Second');
    expect([...files.keys()].filter((k) => k.startsWith('ppt/media/'))).toHaveLength(2);
    expect(files.get('ppt/slides/_rels/slide2.xml.rels')).toContain('../media/image1.png');
  });
  it('preserves aspect ratio and places bespoke cover crops in a picture', () => {
    expect(pictureFit(box, 200, 100, 'contain', '50% 50%').box).toEqual({ x: 10, y: 45, w: 100, h: 50 });
    const cover = pictureFit(box, 200, 100, 'cover', '100% 50%');
    expect(cover.box).toEqual(box);
    expect(cover.crop).toEqual([0.5, 0, 0, 0]);
  });
});
