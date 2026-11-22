import { createStoredZip, crc32, type ZipEntry } from './zipStore';

export const POWERPOINT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DRAW = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PRES = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SLIDE_WIDTH = 12192000;

export type SlideBox = { x: number; y: number; w: number; h: number };
export type Ink = { hex: string; alpha: number };
export type Media = { ext: 'png' | 'jpeg' | 'gif' | 'svg'; bytes: Uint8Array };
export type PictureEffects = {
  tint?: string;
  shadow?: { x: number; y: number; blur: number; ink: Ink };
  glow?: { radius: number; ink: Ink };
};
type Visual = SlideBox & { name: string; rotation?: number; flipH?: boolean };
export type SlideObject = Visual &
  (
    | {
        kind: 'shape';
        fill: Ink;
        geometry?: 'rect' | 'roundRect' | 'ellipse';
        line?: { ink: Ink; width: number; dashed?: boolean };
      }
    | {
        kind: 'text';
        text: string;
        font: string;
        size: number;
        bold: boolean;
        italic: boolean;
        ink: Ink;
        spacing: number;
        underline?: boolean;
      }
    | ({
        kind: 'picture';
        media: Media;
        vector?: Media;
        crop?: number[];
        alpha: number;
        gray?: boolean;
      } & PictureEffects)
  );
export type PowerPointPage = { title: string; width: number; height: number; objects: SlideObject[] };

function xml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function paint(ink: Ink) {
  return (
    '<a:solidFill><a:srgbClr val="' +
    ink.hex +
    '">' +
    (ink.alpha < 1 ? '<a:alpha val="' + Math.round(Math.max(0, ink.alpha) * 100000) + '"/>' : '') +
    '</a:srgbClr></a:solidFill>'
  );
}
function transform(item: SlideObject, scale: number) {
  const unit = (n: number) => Math.round(n * scale);
  const rotation = item.rotation ? ' rot="' + Math.round((((item.rotation % 360) + 360) % 360) * 60000) + '"' : '';
  return (
    '<a:xfrm' +
    rotation +
    (item.flipH ? ' flipH="1"' : '') +
    '><a:off x="' +
    unit(item.x) +
    '" y="' +
    unit(item.y) +
    '"/><a:ext cx="' +
    Math.max(1, unit(item.w)) +
    '" cy="' +
    Math.max(1, unit(item.h)) +
    '"/></a:xfrm>'
  );
}
function geom(name: string) {
  return '<a:prstGeom prst="' + name + '"><a:avLst/></a:prstGeom>';
}
type Reference = { id: string; kind: string; target: string };
function relationships(refs: Reference[]) {
  return (
    '<Relationships xmlns="' +
    PKG +
    '">' +
    refs
      .map((r) => '<Relationship Id="' + r.id + '" Type="' + REL + '/' + r.kind + '" Target="' + r.target + '"/>')
      .join('') +
    '</Relationships>'
  );
}
function reference(id: number, kind: string, target: string): Reference {
  return { id: 'rId' + id, kind, target };
}
const TREE =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const NS = 'xmlns:p="' + PRES + '" xmlns:a="' + DRAW + '" xmlns:r="' + REL + '"';
const MAP =
  '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" tx1="dk1" tx2="dk2" hlink="hlink" folHlink="folHlink"/>';
const MASTER_COLORS = '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
const schemeFill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
function theme() {
  const colors = {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '172031',
    lt2: 'F3F4F5',
    accent1: '4674AA',
    accent2: 'AA5546',
    accent3: '648648',
    accent4: '7C6792',
    accent5: '418D9A',
    accent6: 'B17C3C',
    hlink: '1359A5',
    folHlink: '764E83',
  };
  const fonts = '<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>';
  return (
    '<a:theme xmlns:a="' +
    DRAW +
    '" name="Glyphfield"><a:themeElements><a:clrScheme name="Studio">' +
    Object.entries(colors)
      .map(([k, v]) => '<a:' + k + '><a:srgbClr val="' + v + '"/></a:' + k + '>')
      .join('') +
    '</a:clrScheme><a:fontScheme name="Studio"><a:majorFont>' +
    fonts +
    '</a:majorFont><a:minorFont>' +
    fonts +
    '</a:minorFont></a:fontScheme><a:fmtScheme name="Studio"><a:fillStyleLst>' +
    schemeFill.repeat(3) +
    '</a:fillStyleLst><a:lnStyleLst>' +
    [6350, 12700, 19050].map((w) => '<a:ln w="' + w + '">' + schemeFill + '<a:prstDash val="solid"/></a:ln>').join('') +
    '</a:lnStyleLst><a:effectStyleLst>' +
    '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) +
    '</a:effectStyleLst><a:bgFillStyleLst>' +
    schemeFill.repeat(3) +
    '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'
  );
}
function drawingEffects(effects: PictureEffects, scale: number) {
  const color = (ink: Ink) =>
    '<a:srgbClr val="' + ink.hex + '"><a:alpha val="' + Math.round(ink.alpha * 100000) + '"/></a:srgbClr>';
  const items = [];
  if (effects.glow)
    items.push(
      '<a:glow rad="' + Math.round(effects.glow.radius * scale) + '">' + color(effects.glow.ink) + '</a:glow>',
    );
  if (effects.shadow) {
    const { x, y, blur, ink } = effects.shadow;
    const dir = Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) * 60000);
    items.push(
      '<a:outerShdw blurRad="' +
        Math.round(blur * scale) +
        '" dist="' +
        Math.round(Math.hypot(x, y) * scale) +
        '" dir="' +
        dir +
        '" rotWithShape="0">' +
        color(ink) +
        '</a:outerShdw>',
    );
  }
  return items.length ? '<a:effectLst>' + items.join('') + '</a:effectLst>' : '';
}
function writeObject(item: SlideObject, index: number, scale: number, relationship: (media: Media) => string) {
  const property = '<p:cNvPr id="' + index + '" name="' + xml(item.name) + ' (' + (index - 1) + ')"/>';
  const tf = transform(item, scale);
  if (item.kind === 'picture') {
    const raster = relationship(item.media);
    const vector = item.vector
      ? '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="' +
        relationship(item.vector) +
        '"/></a:ext></a:extLst>'
      : '';
    const src = item.crop
      ? '<a:srcRect ' +
        item.crop.map((n, i) => ['l', 't', 'r', 'b'][i] + '="' + Math.round(n * 100000) + '"').join(' ') +
        '/>'
      : '';
    return (
      '<p:pic><p:nvPicPr>' +
      property +
      '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="' +
      raster +
      '">' +
      (item.alpha < 1 ? '<a:alphaModFix amt="' + Math.round(item.alpha * 100000) + '"/>' : '') +
      (item.gray ? '<a:grayscl/>' : '') +
      (item.tint
        ? '<a:duotone><a:srgbClr val="' + item.tint + '"/><a:srgbClr val="' + item.tint + '"/></a:duotone>'
        : '') +
      vector +
      '</a:blip>' +
      src +
      '<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' +
      tf +
      geom('rect') +
      drawingEffects(item, scale) +
      '</p:spPr></p:pic>'
    );
  }
  const head =
    '<p:sp><p:nvSpPr>' +
    property +
    '<p:cNvSpPr' +
    (item.kind === 'text' ? ' txBox="1"' : '') +
    '/><p:nvPr/></p:nvSpPr><p:spPr>' +
    tf;
  if (item.kind === 'shape') {
    const line = item.line
      ? '<a:ln w="' +
        Math.max(1, Math.round(item.line.width * scale)) +
        '">' +
        paint(item.line.ink) +
        (item.line.dashed ? '<a:prstDash val="dash"/>' : '') +
        '</a:ln>'
      : '<a:ln><a:noFill/></a:ln>';
    return (
      head +
      geom(item.geometry ?? 'rect') +
      (item.fill.alpha > 0 ? paint(item.fill) : '<a:noFill/>') +
      line +
      '</p:spPr></p:sp>'
    );
  }
  const pt100 = scale / 127;
  const size = Math.max(100, Math.min(400000, Math.round(item.size * pt100)));
  const props =
    ' sz="' +
    size +
    '" b="' +
    Number(item.bold) +
    '" i="' +
    Number(item.italic) +
    '"' +
    (item.underline ? ' u="sng"' : '') +
    (item.spacing ? ' spc="' + Math.round(item.spacing * pt100) + '"' : '');
  return (
    head +
    geom('rect') +
    '<a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr><a:r><a:rPr' +
    props +
    '>' +
    paint(item.ink) +
    '<a:latin typeface="' +
    xml(item.font) +
    '"/></a:rPr><a:t>' +
    xml(item.text) +
    '</a:t></a:r></a:p></p:txBody></p:sp>'
  );
}

/** Coordinates come from each rendered page, so zoom or thumbnail size do not affect the file. */
export function serializePowerPoint(pages: PowerPointPage[]): Uint8Array {
  if (!pages.length || pages.some((page) => !(page.width > 0 && page.height > 0)))
    throw new Error('No visible brand book pages to export.');
  const entries: ZipEntry[] = [];
  const encoder = new TextEncoder();
  const add = (name: string, body: string) => entries.push({ name, bytes: encoder.encode(XML + body) });
  const imageFiles = new Map<string, { path: string; bytes: Uint8Array }[]>();
  let imageCount = 0;
  function mediaPath(media: Media) {
    const key = media.ext + '-' + media.bytes.length + '-' + crc32(media.bytes);
    const sameHash = imageFiles.get(key) ?? [];
    const match = sameHash.find((candidate) => candidate.bytes.every((value, i) => value === media.bytes[i]));
    if (match) return match.path;
    const path = 'media/image' + ++imageCount + '.' + media.ext;
    entries.push({ name: 'ppt/' + path, bytes: media.bytes });
    sameHash.push({ path, bytes: media.bytes });
    imageFiles.set(key, sameHash);
    return path;
  }
  const scale = SLIDE_WIDTH / pages[0].width;
  const height = Math.round(pages[0].height * scale);
  const overrides: [string, string][] = [
    ['presentation.xml', 'presentation.main'],
    ['slideMasters/slideMaster1.xml', 'slideMaster'],
    ['slideLayouts/slideLayout1.xml', 'slideLayout'],
  ];
  add('_rels/.rels', relationships([reference(1, 'officeDocument', 'ppt/presentation.xml')]));
  add(
    'ppt/presentation.xml',
    '<p:presentation ' +
      NS +
      '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' +
      pages.map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join('') +
      '</p:sldIdLst><p:sldSz cx="' +
      SLIDE_WIDTH +
      '" cy="' +
      height +
      '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
  );
  add(
    'ppt/_rels/presentation.xml.rels',
    relationships([
      reference(1, 'slideMaster', 'slideMasters/slideMaster1.xml'),
      ...pages.map((_, i) => reference(i + 2, 'slide', 'slides/slide' + (i + 1) + '.xml')),
    ]),
  );
  add(
    'ppt/slideMasters/slideMaster1.xml',
    '<p:sldMaster ' +
      NS +
      '><p:cSld><p:spTree>' +
      TREE +
      '</p:spTree></p:cSld>' +
      MAP +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>',
  );
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    relationships([
      reference(1, 'slideLayout', '../slideLayouts/slideLayout1.xml'),
      reference(2, 'theme', '../theme/theme1.xml'),
    ]),
  );
  add(
    'ppt/slideLayouts/slideLayout1.xml',
    '<p:sldLayout ' +
      NS +
      ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' +
      TREE +
      '</p:spTree></p:cSld>' +
      MASTER_COLORS +
      '</p:sldLayout>',
  );
  add(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    relationships([reference(1, 'slideMaster', '../slideMasters/slideMaster1.xml')]),
  );
  add('ppt/theme/theme1.xml', theme());
  pages.forEach((page, i) => {
    const filename = 'slide' + (i + 1) + '.xml';
    const refs = [reference(1, 'slideLayout', '../slideLayouts/slideLayout1.xml')];
    const pageMedia = new Map<Media, string>();
    const bind = (media: Media) => {
      const known = pageMedia.get(media);
      if (known) return known;
      const target = '../' + mediaPath(media);
      const ref = refs.find((r) => r.target === target) ?? reference(refs.length + 1, 'image', target);
      if (!refs.includes(ref)) refs.push(ref);
      pageMedia.set(media, ref.id);
      return ref.id;
    };
    overrides.push(['slides/' + filename, 'slide']);
    add(
      'ppt/slides/' + filename,
      '<p:sld ' +
        NS +
        '><p:cSld name="' +
        xml(page.title) +
        '"><p:spTree>' +
        TREE +
        page.objects.map((o, j) => writeObject(o, j + 2, SLIDE_WIDTH / page.width, bind)).join('') +
        '</p:spTree></p:cSld>' +
        MASTER_COLORS +
        '</p:sld>',
    );
    add('ppt/slides/_rels/' + filename + '.rels', relationships(refs));
  });
  const defaults = {
    rels: 'application/vnd.openxmlformats-package.relationships+xml',
    xml: 'application/xml',
    png: 'image/png',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
  };
  add(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      Object.entries(defaults)
        .map(([ext, mime]) => '<Default Extension="' + ext + '" ContentType="' + mime + '"/>')
        .join('') +
      overrides
        .map(
          ([p, t]) =>
            '<Override PartName="/ppt/' +
            p +
            '" ContentType="application/vnd.openxmlformats-officedocument.presentationml.' +
            t +
            '+xml"/>',
        )
        .join('') +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
  );
  return createStoredZip(entries);
}
