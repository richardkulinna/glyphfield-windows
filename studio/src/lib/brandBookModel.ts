/**
 * Brand book structure and edits: sections, one-idea pages, default copy from
 * the identity, layout variants, surfaces, images, and the versioned source.
 * Rendering lives in BrandBook.tsx; this module stays framework-free.
 */
import { orderItems, readLayout, readStructure, type BookLayout, type BookStructure } from './bookEditing';
import type { BrandIdentity } from './brandIdentity';
import { getBrandIconPacks } from './brandMedia';
import { brandCoverAsset } from './brandCover';
import { BRAND_SURFACE_TONES, brandVisualAssets, type BrandSurfaceTone } from './brandOutputKit';
import { brandSampleEvent, brandSamplePerson } from './brandContent';
import { getEmailLifecycleTemplate } from './emailLifecycle';

export const BOOK_SECTION_IDS = [
  'strategy',
  'logo',
  'colour',
  'typography',
  'device',
  'imagery',
  'voice',
  'applications',
  'motion',
] as const;

export type BookSectionId = (typeof BOOK_SECTION_IDS)[number];
export type BookGroupId = BookSectionId | 'intro' | 'closing';

export const BOOK_SECTION_NAMES: Record<BookGroupId, string> = {
  applications: 'Applications',
  closing: 'Closing',
  colour: 'Colour',
  device: 'Graphic device',
  imagery: 'Imagery',
  intro: 'Introduction',
  logo: 'Logo',
  motion: 'Motion',
  strategy: 'Strategy',
  typography: 'Typography',
  voice: 'Voice',
};

const BOOK_SECTION_SUMMARIES: Record<BookSectionId, string> = {
  applications: 'The system at work: grid, print, digital, social, and event surfaces.',
  colour: 'Palette, roles, proportion, and every approved pairing with its contrast.',
  device: 'The ownable graphic idea, how it is built, and how far it can flex.',
  imagery: 'What images show, how they are treated, and the approved library.',
  logo: 'The signature, its family, protected space, minimum sizes, and misuse.',
  motion: 'Timing, easing, and how the device behaves when it moves.',
  strategy: 'Why the brand exists, who it serves, and the idea that organizes it.',
  typography: 'Typefaces, pairing, the type scale, and the role of each style.',
  voice: 'How the brand sounds, with real lines to use and lines to avoid.',
};

/** Page layouts. The first variant is the default. */
export const BOOK_PAGE_VARIANTS = {
  applicationsDigital: ['web', 'email'],
  applicationsEvent: ['badge', 'backdrop'],
  applicationsGrid: ['twelve', 'six'],
  applicationsPrint: ['stationery', 'card'],
  applicationsSheet: ['grid', 'strip'],
  applicationsSocial: ['posts', 'stories'],
  closing: ['mark', 'statement'],
  colourPairings: ['matrix', 'cards'],
  colourPairingsFiltered: ['matrix'],
  colourPairingsGray: ['matrix'],
  colourShades: ['ramps'],
  colourRoles: ['grid'],
  typeGlyphs: ['glyphs'],
  logoPlacement: ['grid'],
  imageryCrops: ['grid'],
  colourPalette: ['tiles', 'bands'],
  colourProportion: ['bar', 'field'],
  colourTints: ['ramps', 'steps'],
  contents: ['list', 'columns'],
  cover: ['device', 'image', 'type'],
  deviceConstruction: ['grid', 'annotated'],
  deviceHero: ['full', 'split'],
  deviceIcons: ['grid', 'large'],
  deviceRules: ['split', 'stacked'],
  deviceVariations: ['triptych', 'pair'],
  foreword: ['letter', 'statement'],
  imageryDirection: ['split', 'full'],
  imageryLibrary: ['grid', 'feature'],
  imageryTreatment: ['compare', 'single'],
  logoClearspace: ['diagram', 'grid'],
  logoColorways: ['grid', 'row'],
  logoFamily: ['grid', 'stack'],
  logoMinimum: ['scale', 'table'],
  logoMisuse: ['grid', 'list'],
  logoPrimary: ['centered', 'offset'],
  motionPrinciples: ['curves', 'list'],
  motionSequence: ['frames', 'strip'],
  motionTokens: ['table', 'cards'],
  opener: ['numeral', 'device', 'image'],
  strategyAudience: ['grid', 'list'],
  strategyChallenge: ['flow', 'columns'],
  strategyMission: ['split', 'stacked'],
  strategyPillars: ['list', 'grid'],
  strategyPremise: ['statement', 'centered'],
  typeDisplay: ['specimen', 'glyphs'],
  typePairing: ['split', 'stacked'],
  typeRoles: ['table', 'cards'],
  typeScale: ['ladder', 'sample'],
  typeText: ['columns', 'single'],
  voiceDoDont: ['split', 'rows'],
  voiceMessaging: ['hierarchy', 'cards'],
  voicePrinciples: ['list', 'grid'],
  voiceSample: ['email', 'web'],
} as const satisfies Record<string, readonly string[]>;

export type BookPageKind = keyof typeof BOOK_PAGE_VARIANTS;

export const BOOK_VARIANT_LABELS: Record<string, string> = {
  annotated: 'Annotated', backdrop: 'Backdrop', badge: 'Badge', bands: 'Bands', bar: 'Bar', cards: 'Cards',
  card: 'Card', centered: 'Centered', columns: 'Columns', compare: 'Compare', curves: 'Curves', device: 'Device',
  diagram: 'Diagram', email: 'Email', feature: 'Feature', field: 'Field', flow: 'Flow', frames: 'Frames',
  full: 'Full bleed', glyphs: 'Glyphs', grid: 'Grid', hierarchy: 'Hierarchy', image: 'Image', large: 'Large',
  letter: 'Letter', list: 'List', mark: 'Mark', matrix: 'Matrix', numeral: 'Numeral', offset: 'Offset',
  pair: 'Pair', posts: 'Posts', ramps: 'Ramps', row: 'Row', rows: 'Rows', sample: 'Sample', scale: 'Scale',
  single: 'Single', six: 'Six columns', specimen: 'Specimen', split: 'Split', stack: 'Stack', stacked: 'Stacked',
  statement: 'Statement', stationery: 'Stationery', steps: 'Steps', stories: 'Stories', strip: 'Strip',
  table: 'Table', tiles: 'Tiles', triptych: 'Triptych', twelve: 'Twelve columns', type: 'Type', web: 'Web',
};

export type BookPageDefinition = {
  /** Default copy for every editable slot on the page. */
  copy: Record<string, string>;
  group: string;
  id: string;
  rowStart?: number;
  columnStart?: number;
  /** True when the layout shows a swappable library image. */
  image: boolean;
  kind: BookPageKind;
  title: string;
  tone: BrandSurfaceTone;
};

type PageSeed = Omit<BookPageDefinition, 'group' | 'image'> & { image?: boolean };

function first(values: readonly unknown[] | undefined, fallback = ''): string {
  return values?.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? fallback;
}

function at(values: readonly unknown[] | undefined, index: number, fallback = ''): string {
  const value = values?.[index];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function opener(section: BookSectionId, identity: BrandIdentity, tone: BrandSurfaceTone): PageSeed {
  return {
    copy: { summary: BOOK_SECTION_SUMMARIES[section], title: BOOK_SECTION_NAMES[section] },
    id: `${section}-opener`,
    image: true,
    kind: 'opener',
    title: BOOK_SECTION_NAMES[section],
    tone,
  };
}

/** Full-page accent, unless the brand keeps its accent to one element (GT: never a wash). */
function accentPageTone(identity: BrandIdentity): BrandSurfaceTone {
  return identity.artDirection?.preview === 'translation-frame' ? 'ink' : 'accent';
}

/** Dark-led identities open sections on their deep colour; light-led ones on paper. */
function openerTone(identity: BrandIdentity, index: number): BrandSurfaceTone {
  const preview = identity.artDirection?.preview;
  if (preview === 'economic-ledger' || preview === 'network-horizon' || preview === 'focus-window') return index % 3 === 1 ? 'accent' : 'paper';
  if (preview === 'translation-frame') return index % 2 === 0 ? 'ink' : 'paper';
  return index % 3 === 2 ? 'accent' : 'deep';
}

function strategyPages(identity: BrandIdentity): PageSeed[] {
  const strategy = identity.strategy;
  return [
    { copy: { aside: identity.positioning, statement: strategy?.concept ?? identity.tagline }, id: 'strategy-premise', kind: 'strategyPremise', title: 'Brand idea', tone: 'paper' },
    { copy: { challenge: strategy?.challenge ?? '', outcome: strategy?.outcome ?? '', promise: strategy?.promise ?? '' }, id: 'strategy-challenge', kind: 'strategyChallenge', title: 'Challenge, promise, outcome', tone: 'paper' },
    { copy: { mission: identity.mission, position: identity.positioning }, id: 'strategy-mission', kind: 'strategyMission', title: 'Mission and position', tone: 'muted' },
    { copy: { lead: `${identity.name} speaks to the people who build with it, buy it, and recommend it.` }, id: 'strategy-audience', kind: 'strategyAudience', title: 'Audience and personality', tone: 'paper' },
    { copy: { lead: 'Use the following priorities when choosing between design options.' }, id: 'strategy-pillars', kind: 'strategyPillars', title: 'Pillars and values', tone: 'paper' },
  ];
}

function logoPages(identity: BrandIdentity): PageSeed[] {
  return [
    { copy: { lead: identity.dossier?.logo ?? 'The mark is a signature, not a decoration. Give it room and keep it exact.' }, id: 'logo-primary', kind: 'logoPrimary', title: 'Primary mark', tone: 'paper' },
    { copy: { lead: 'Use the artwork files as supplied. Choose the mark for small or square spaces and the wordmark where there is room to read.' }, id: 'logo-family', kind: 'logoFamily', title: 'Logo family', tone: 'paper' },
    { copy: { title: 'Logo clear space', lead: identity.dossier?.logo ?? '', unit: 'Clear space' }, id: 'logo-clearspace', kind: 'logoClearspace', title: 'Clear space', tone: 'muted' },
    { copy: { lead: 'Choose minimum sizes for each output format.', markDigital: 'To specify', markPrint: 'To specify', wordmarkDigital: 'To specify', wordmarkPrint: 'To specify' }, id: 'logo-minimum', kind: 'logoMinimum', title: 'Minimum size', tone: 'paper' },
    { copy: { lead: 'The logo appears in its approved colours on approved surfaces only. Pick the version with the strongest contrast.' }, id: 'logo-colorways', kind: 'logoColorways', title: 'Colourways', tone: 'paper' },
    { copy: { title: 'Logo dos and don’ts', lead: first(identity.dossier?.prohibited.filter((rule) => /logo|mark|wordmark|symbol/i.test(rule)), 'Never alter the artwork. Every change below weakens recognition.') }, id: 'logo-misuse', kind: 'logoMisuse', title: 'Logo dos and don’ts', tone: 'paper' },
    { copy: { title: 'Logoplatzierung', lead: '' }, id: 'logo-placement', kind: 'logoPlacement', title: 'Logoplatzierung', tone: 'paper' },
  ];
}

function colourPages(identity: BrandIdentity): PageSeed[] {
  const seeds: PageSeed[] = [
    { copy: { lead: identity.dossier?.color ?? 'A small palette, used with discipline, is easier to recognise than a large one.' }, id: 'colour-palette', kind: 'colourPalette', title: 'Palette', tone: 'paper' },
    { copy: { lead: 'Most of every surface is the dominant colour. The accent appears rarely, so it always means something.' }, id: 'colour-proportion', kind: 'colourProportion', title: 'Proportion', tone: 'paper' },
    { copy: { title: 'Kontrastmatrix', lead: 'Zeile = Hintergrund. Spalte = Schriftfarbe.' }, id: 'colour-pairings', kind: 'colourPairings', title: 'Kontrastmatrix', tone: 'paper' },
    { copy: { title: 'Kontrastmatrix für Text', lead: 'Paare ab 3 : 1 sind sichtbar. Ein Rahmen kennzeichnet die Paare für Fließtext.' }, id: 'colour-pairings-filtered', kind: 'colourPairingsFiltered', title: 'Kontrastmatrix für Text', tone: 'paper' },
    { copy: { title: 'Kontrastmatrix in Graustufen', lead: 'Die Graustufen zeigen die Helligkeitsunterschiede. Die Werte beziehen sich auf die Originalfarben.' }, id: 'colour-pairings-gray', kind: 'colourPairingsGray', title: 'Kontrastmatrix in Graustufen', tone: 'paper' },
    { copy: { title: 'Tints / Aufhellungen', lead: 'Von links nach rechts steigt der Weißanteil. Jede Reihe beginnt mit dem exakten Originalton.' }, id: 'colour-tints', kind: 'colourTints', title: 'Tints / Aufhellungen', tone: 'paper' },
    { copy: { title: 'Shades / Abdunklungen', lead: 'Von links nach rechts steigt der Schwarzanteil. Jede Reihe beginnt mit dem exakten Originalton.' }, id: 'colour-shades', kind: 'colourShades', title: 'Shades / Abdunklungen', tone: 'paper' },
    { copy: { title: 'Farben im Einsatz', lead: '' }, id: 'colour-roles', kind: 'colourRoles', title: 'Farben im Einsatz', tone: 'paper' },
  ];
  const blocks = Math.max(1, Math.ceil(identity.colors.length / 8));
  return seeds.flatMap(page => {
    const matrix = page.kind.startsWith('colourPairings');
    if (blocks === 1 || (!matrix && !['colourTints', 'colourShades'].includes(page.kind))) return [page];
    const pages: PageSeed[] = [];
    for (let row = 0; row < blocks; row++) {
      for (let column = 0; column < (matrix ? blocks : 1); column++) {
        const rowStart = row * 8;
        const columnStart = column * 8;
        const part = pages.length + 1;
        const title = page.title + ' (' + part + '/' + (matrix ? blocks * blocks : blocks) + ')';
        pages.push({ ...page, rowStart, columnStart, title, copy: { ...page.copy, title },
          id: part === 1 ? page.id : page.id + '-r' + row + '-c' + column });
      }
    }
    return pages;
  });
}

function typographyPages(identity: BrandIdentity): PageSeed[] {
  return [
    { copy: { lead: identity.typography?.find((font) => font.role === 'Display')?.usage ?? 'Large statements and headlines.', sample: identity.tagline }, id: 'type-display', kind: 'typeDisplay', title: 'Display typeface', tone: 'paper' },
    { copy: { lead: identity.typography?.find((font) => font.role === 'Body')?.usage ?? 'Reading, interface, and explanation.', sample: identity.positioning || identity.mission }, id: 'type-text', kind: 'typeText', title: 'Text typeface', tone: 'paper' },
    { copy: { body: identity.positioning, headline: identity.strategy?.promise ?? identity.tagline }, id: 'type-pairing', kind: 'typePairing', title: 'Pairing', tone: 'muted' },
    { copy: { lead: `Modular scale: ${identity.typeScale?.basePx ?? 16} px base, ratio ${identity.typeScale?.ratio ?? 1.25}.` }, id: 'type-scale', kind: 'typeScale', title: 'Type scale', tone: 'paper' },
    { copy: { lead: identity.dossier?.typography ?? 'Each role has one job. Do not substitute faces between roles.' }, id: 'type-roles', kind: 'typeRoles', title: 'Roles', tone: 'paper' },
    { copy: { title: 'Zeichensatz', lead: '' }, id: 'type-glyphs', kind: 'typeGlyphs', title: 'Zeichensatz', tone: 'paper' },
  ];
}

function devicePages(identity: BrandIdentity): PageSeed[] {
  const graphic = identity.graphicSystem;
  const seeds: PageSeed[] = [
    { copy: { body: graphic?.description ?? '', title: graphic?.device ?? 'Graphic device' }, id: 'device-hero', kind: 'deviceHero', title: 'The device', tone: 'deep' },
    { copy: { lead: graphic?.composition ?? '' }, id: 'device-construction', kind: 'deviceConstruction', title: 'Construction', tone: 'paper' },
    { copy: { lead: identity.dossier?.graphicDevice ?? 'The device flexes in scale and crop while its idea stays intact.' }, id: 'device-variations', kind: 'deviceVariations', title: 'Variations', tone: 'paper' },
    { copy: { lead: 'Icons share one stroke, one grid, and one corner radius with the rest of the system.' }, id: 'device-icons', kind: 'deviceIcons', title: 'Icon system', tone: 'muted' },
    { copy: { lead: 'Rules that keep the device ownable.' }, id: 'device-rules', kind: 'deviceRules', title: 'Device rules', tone: 'paper' },
  ];
  const count = getBrandIconPacks(identity.assets).reduce((sum, pack) => sum + pack.icons.length, 0);
  const pages = Math.ceil(count / 12);
  return seeds.flatMap(seed => {
    if (seed.kind !== 'deviceIcons' || pages < 2) return [seed];
    return Array.from({ length: pages }, (_, index) => ({
      ...seed, rowStart: index * 12, id: index ? seed.id + '-p' + (index + 1) : seed.id,
      title: seed.title + ' (' + (index + 1) + '/' + pages + ')'
    }));
  });
}

function imageryPages(identity: BrandIdentity): PageSeed[] {
  return [
    { copy: { body: identity.dossier?.imagery ?? '', title: identity.graphicSystem?.imageDirection ?? '' }, id: 'imagery-direction', image: true, kind: 'imageryDirection', title: 'Image direction', tone: 'paper' },
    { copy: { lead: 'Approved library images. Use them as supplied; crop for composition, never for decoration.' }, id: 'imagery-library', image: true, kind: 'imageryLibrary', title: 'Library', tone: 'paper' },
    { copy: { title: 'Bildausschnitte', lead: '' }, id: 'imagery-crops', kind: 'imageryCrops', title: 'Bildausschnitte', image: true, tone: 'paper' },
    { copy: { lead: identity.style?.imageTreatment === 'natural' ? 'Images keep their natural colour. Correct exposure and white balance; never tint.' : `Images use the ${identity.style?.imageTreatment} treatment so photography sits inside the palette.` }, id: 'imagery-treatment', image: true, kind: 'imageryTreatment', title: 'Treatment', tone: 'muted' },
  ];
}

/** Three distinct levels: when the promise or a phrase repeats the tagline, step to the next line. */
function messagingCopy(identity: BrandIdentity): Record<string, string> {
  const tagline = identity.tagline;
  const candidates = [identity.strategy?.promise, identity.strategy?.concept, identity.positioning].filter((value): value is string => Boolean(value?.trim()));
  const promise = candidates.find((value) => value !== tagline) ?? '';
  const phrase = (identity.voice?.phrases ?? []).find((value) => value !== tagline && value !== promise) ?? identity.mission ?? '';
  return { phrase, promise, tagline };
}

function voicePages(identity: BrandIdentity): PageSeed[] {
  const welcome = getEmailLifecycleTemplate('welcome-email', identity);
  return [
    { copy: { lead: identity.dossier?.personality ?? 'How the brand sounds when it is at its best.' }, id: 'voice-principles', kind: 'voicePrinciples', title: 'Voice principles', tone: 'paper' },
    { copy: { lead: 'Real lines in real places. Write the left column; the right column is the version to leave out.' }, id: 'voice-dodont', kind: 'voiceDoDont', title: 'Do and don’t', tone: 'paper' },
    { copy: messagingCopy(identity), id: 'voice-messaging', kind: 'voiceMessaging', title: 'Messaging hierarchy', tone: 'muted' },
    { copy: { body: welcome?.body ?? identity.positioning, cta: welcome?.cta ?? 'Get started', subject: welcome?.subject ?? `Welcome to ${identity.name}` }, id: 'voice-sample', kind: 'voiceSample', title: 'Voice in use', tone: 'paper' },
  ];
}

function applicationPages(identity: BrandIdentity): PageSeed[] {
  return [
    { copy: { lead: identity.dossier?.layout ?? 'A twelve-column grid with generous margins aligns every surface.' }, id: 'applications-grid', kind: 'applicationsGrid', title: 'Layout grid', tone: 'paper' },
    { copy: { name: brandSamplePerson(identity).name, role: brandSamplePerson(identity).role }, id: 'applications-print', kind: 'applicationsPrint', title: 'Stationery', tone: 'muted' },
    { copy: { body: identity.positioning, headline: identity.tagline }, id: 'applications-digital', image: true, kind: 'applicationsDigital', title: 'Digital', tone: 'paper' },
    { copy: { headline: at(identity.voice?.phrases, 1, identity.tagline) }, id: 'applications-social', image: true, kind: 'applicationsSocial', title: 'Social', tone: 'paper' },
    { copy: { event: brandSampleEvent(identity).name, name: brandSamplePerson(identity).name }, id: 'applications-event', kind: 'applicationsEvent', title: 'Events', tone: 'muted' },
    { copy: { lead: 'The applications in this book, side by side.' }, id: 'applications-sheet', image: true, kind: 'applicationsSheet', title: 'Identity in use', tone: 'deep' },
  ];
}

function motionPages(identity: BrandIdentity): PageSeed[] {
  return [
    { copy: { lead: identity.dossier?.motion ?? 'Motion clarifies change. It never decorates.' }, id: 'motion-principles', kind: 'motionPrinciples', title: 'Motion principles', tone: 'paper' },
    { copy: { lead: 'Use these tokens in code and in edit. Do not invent new durations.' }, id: 'motion-tokens', kind: 'motionTokens', title: 'Motion tokens', tone: 'paper' },
    { copy: { lead: 'The device in five frames.' }, id: 'motion-sequence', kind: 'motionSequence', title: 'Device in motion', tone: 'deep' },
  ];
}

const SECTION_PAGES: Record<BookSectionId, (identity: BrandIdentity) => PageSeed[]> = {
  applications: applicationPages,
  colour: colourPages,
  device: devicePages,
  imagery: imageryPages,
  logo: logoPages,
  motion: motionPages,
  strategy: strategyPages,
  typography: typographyPages,
  voice: voicePages,
};

function withGroup(group: BookGroupId, page: PageSeed): BookPageDefinition {
  return { ...page, group, image: page.image ?? false };
}

/** Every page of the default book for an identity, grouped and in order. */
export function bookPageDefinitions(identity: BrandIdentity): Record<BookGroupId, BookPageDefinition[]> {
  const sections = Object.fromEntries(BOOK_SECTION_IDS.map((section, index) => [
    section,
    [opener(section, identity, openerTone(identity, index)), ...SECTION_PAGES[section](identity)].map((page) => withGroup(section, page)),
  ])) as Record<BookSectionId, BookPageDefinition[]>;
  return {
    ...sections,
    closing: [withGroup('closing', { copy: { statement: identity.tagline }, id: 'closing', kind: 'closing', title: 'Closing', tone: accentPageTone(identity) })],
    intro: [
      withGroup('intro', { copy: { subtitle: identity.strategy?.concept ?? identity.description, title: identity.tagline }, id: 'cover', image: true, kind: 'cover', title: 'Cover', tone: 'deep' }),
      withGroup('intro', { copy: { title: 'Contents' }, id: 'contents', kind: 'contents', title: 'Contents', tone: 'paper' }),
      withGroup('intro', { copy: { body: `These guidelines describe the ideas and repeatable choices that make ${identity.name} recognisable. Use them as a shared standard, not a collection of decoration. When a situation is not covered here, choose the option that is simplest and closest to the brand idea.`, statement: identity.description }, id: 'foreword', kind: 'foreword', title: 'Using this book', tone: accentPageTone(identity) }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Overrides and resolution
// ---------------------------------------------------------------------------

export type BookPageOverride = {
  layout?: BookLayout;
  assetId?: string;
  copy?: Record<string, string>;
  hidden?: boolean;
  tone?: BrandSurfaceTone;
  variant?: string;
};

export type BookOverrides = {
  pages?: Record<string, BookPageOverride>;
  sectionOrder?: string[];
  sections?: Record<string, { hidden?: boolean }>;
  structure?: BookStructure;
};

export type BookPage = BookPageDefinition & {
  layout?: BookLayout;
  assetId: string;
  hidden: boolean;
  variant: string;
  variants: readonly string[];
};

export type BookSection = {
  hidden: boolean;
  id: string;
  name: string;
  pages: BookPage[];
};

export function bookImageAssetIds(identity: BrandIdentity): string[] {
  return brandVisualAssets(identity).map(({ id }) => id);
}

function defaultPageAsset(page: BookPageDefinition, index: number, images: readonly string[], coverId: string | undefined): string {
  if (!page.image || images.length === 0) return '';
  if (page.kind === 'cover' && coverId) return coverId;
  return images[index % images.length]!;
}

/** The first variant, except that the cover leads with the identity's cover art when it has one. */
function defaultPageVariant(page: BookPageDefinition, variants: readonly string[], coverId: string | undefined): string {
  return page.kind === 'cover' && coverId ? 'image' : variants[0]!;
}

function resolvePage(page: BookPageDefinition, override: BookPageOverride | undefined, index: number, images: readonly string[], coverId: string | undefined): BookPage {
  const variants = BOOK_PAGE_VARIANTS[page.kind] as readonly string[];
  return {
    ...page,
    ...(override?.layout ? { layout: override.layout } : {}),
    assetId: override?.assetId ?? defaultPageAsset(page, index, images, coverId),
    copy: { ...page.copy, ...override?.copy },
    hidden: override?.hidden ?? false,
    tone: override?.tone ?? page.tone,
    variant: override?.variant && variants.includes(override.variant) ? override.variant : defaultPageVariant(page, variants, coverId),
    variants,
  };
}

export function sectionOrder(overrides: BookOverrides | undefined): string[] {
  const ids: string[] = [...BOOK_SECTION_IDS, ...(overrides?.structure?.chapters ?? []).map(chapter => chapter.id)];
  return [...new Set([...(overrides?.sectionOrder ?? []).filter(id => ids.includes(id)), ...ids])];
}

function definitionsForBook(identity: BrandIdentity, structure?: BookStructure): Record<string, BookPageDefinition[]> {
  const groups: Record<string, BookPageDefinition[]> = bookPageDefinitions(identity);
  const templates = new Map(Object.values(groups).flat().map(page => [page.id, page]));
  for (const chapter of structure?.chapters ?? []) groups[chapter.id] = [];
  for (const page of structure?.additions ?? []) {
    // A saved duplicate of a continuation stays editable if its palette or icon pack later shrinks.
    const baseId = page.template.replace(/-r\d+-c\d+$|-p\d+$/, '');
    const template = templates.get(page.template) ?? templates.get(baseId);
    if (!template || !groups[page.group]) throw new RangeError('Unknown template or section in a custom page.');
    groups[page.group]!.push({ ...template, group: page.group, id: page.id, title: page.title,
      copy: Object.hasOwn(template.copy, 'title') ? { ...template.copy, title: page.title } : template.copy });
  }
  return groups;
}

export function resolveBook(identity: BrandIdentity, overrides: BookOverrides | undefined): BookSection[] {
  const structure = overrides?.structure;
  const definitions = definitionsForBook(identity, structure);
  const images = bookImageAssetIds(identity);
  const cover = brandCoverAsset(identity)?.id;
  const coverId = cover && images.includes(cover) ? cover : undefined;
  const names = new Map((structure?.chapters ?? []).map(c => [c.id,c.name]));
  let imageIndex = 0;
  return ['intro', ...sectionOrder(overrides), 'closing']
    .filter(id => !structure?.removedSections?.includes(id))
    .map(id => ({
      hidden: overrides?.sections?.[id]?.hidden ?? false,
      id,
      name: names.get(id) ?? BOOK_SECTION_NAMES[id as BookGroupId],
      pages: orderItems(definitions[id] ?? [], structure?.pageOrders?.[id])
        .filter(page => !structure?.removedPages?.includes(page.id))
        .map(page => resolvePage(page, overrides?.pages?.[page.id], page.image ? imageIndex++ : 0, images, coverId)),
    }));
}

/** Pages that print and receive folios, in reading order. */
export function visibleBookPages(sections: readonly BookSection[]): Array<BookPage & { folio: number; section: BookSection }> {
  let folio = 0;
  return sections.flatMap((section) => (section.hidden ? [] : section.pages.flatMap((page) => {
    if (page.hidden) return [];
    folio += 1;
    return [{ ...page, folio, section }];
  })));
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export const BOOK_SOURCE_SCHEMA = 'glyphfield.brand-book';
export const BOOK_SOURCE_VERSION = 1;
const MAX_COPY = 8192;

export function bookSource(identity: BrandIdentity, overrides: BookOverrides | undefined) {
  const removed = new Set(overrides?.structure?.removedPages);
  const removedSections = new Set(overrides?.structure?.removedSections);
  const archive: Record<string, BookPageOverride> = {};
  if (overrides?.pages && (removed.size || removedSections.size)) {
    for (const page of Object.values(definitionsForBook(identity, overrides.structure)).flat()) {
      const saved = overrides.pages[page.id];
      if (saved && (removed.has(page.id) || removedSections.has(page.group))) archive[page.id] = saved;
    }
  }
  return {
    schema: BOOK_SOURCE_SCHEMA,
    ...(Object.keys(archive).length ? { archivedPages: archive } : {}),
    ...(overrides?.structure ? { structure: overrides.structure } : {}),
    sections: resolveBook(identity, overrides).map((section) => ({
      hidden: section.hidden,
      id: section.id,
      name: section.name,
      pages: section.pages.map((page) => ({
        assetId: page.assetId,
        copy: page.copy,
        hidden: page.hidden,
        id: page.id,
        imageSlot: page.image,
        ...(page.layout ? { layout: page.layout } : {}),
        title: page.title,
        tone: page.tone,
        variant: page.variant,
        variants: page.variants,
      })),
    })),
    version: BOOK_SOURCE_VERSION,
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function parsePageCopy(value: unknown, page: BookPageDefinition, path: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const copy = record(value, path);
  const next: Record<string, string> = {};
  for (const [slot, text] of Object.entries(copy)) {
    if (!Object.hasOwn(page.copy, slot)) throw new RangeError(`${path}.${slot} is not an editable slot; use ${Object.keys(page.copy).join(', ')}.`);
    if (typeof text !== 'string') throw new TypeError(`${path}.${slot} must be a string.`);
    if (text === page.copy[slot]) continue;
    if (text.length > Math.max(MAX_COPY, page.copy[slot]!.length)) throw new RangeError(`${path}.${slot} must be at most ${MAX_COPY} characters.`);
    next[slot] = text;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function parseHidden(value: unknown, path: string): true | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${path} must be a Boolean.`);
  return value || undefined;
}

function parseVariant(value: unknown, defaults: BookPage, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (!defaults.variants.includes(String(value))) throw new RangeError(`${path} must be one of ${defaults.variants.join(', ')}.`);
  return value !== defaults.variant ? String(value) : undefined;
}

function parseTone(value: unknown, page: BookPageDefinition, path: string): BrandSurfaceTone | undefined {
  if (value === undefined) return undefined;
  if (!BRAND_SURFACE_TONES.includes(value as BrandSurfaceTone)) throw new RangeError(`${path} must be one of ${BRAND_SURFACE_TONES.join(', ')}.`);
  return value !== page.tone ? value as BrandSurfaceTone : undefined;
}

function parseAsset(value: unknown, page: BookPageDefinition, defaults: BookPage, images: readonly string[], path: string): string | undefined {
  if (value === undefined || !page.image) return undefined;
  if (value !== '' && !images.includes(String(value))) throw new RangeError(`${path} must be an identity image asset ID.`);
  return value !== defaults.assetId ? String(value) : undefined;
}

function parsePage(value: Record<string, unknown>, page: BookPageDefinition, defaults: BookPage, images: readonly string[], path: string): BookPageOverride | undefined {
  const override: BookPageOverride = {
    layout: readLayout(value.layout),
    assetId: parseAsset(value.assetId, page, defaults, images, `${path}.assetId`),
    copy: parsePageCopy(value.copy, page, `${path}.copy`),
    hidden: parseHidden(value.hidden, `${path}.hidden`),
    tone: parseTone(value.tone, page, `${path}.tone`),
    variant: parseVariant(value.variant, defaults, `${path}.variant`),
  };
  const entries = Object.entries(override).filter(([, entry]) => entry !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) as BookPageOverride : undefined;
}

type BookParseContext = {
  images: readonly string[];
  next: Required<Pick<BookOverrides, 'pages' | 'sections'>>;
  pagesById: Map<string, BookPageDefinition>;
  resolvedById: Map<string, BookPage>;
};

function parseSectionVisibility(section: Record<string, unknown>, id: string, path: string, context: BookParseContext) {
  if (section.hidden === undefined) return;
  if (typeof section.hidden !== 'boolean') throw new TypeError(`${path}.hidden must be a Boolean.`);
  if (section.hidden) context.next.sections[id] = { hidden: true };
  else delete context.next.sections[id];
}

function parseSectionPages(pages: unknown, id: string, path: string, context: BookParseContext) {
  if (pages === undefined) return;
  if (!Array.isArray(pages)) throw new TypeError(`${path}.pages must be an array.`);
  pages.forEach((pageEntry, pageIndex) => {
    const pagePath = `${path}.pages.${pageIndex}`;
    const pageValue = record(pageEntry, pagePath);
    const page = context.pagesById.get(String(pageValue.id));
    if (!page || page.group !== id) throw new RangeError(`${pagePath}.id is not a page of section ${id}.`);
    const override = parsePage(pageValue, page, context.resolvedById.get(page.id)!, context.images, pagePath);
    if (override) context.next.pages[page.id] = override;
    else delete context.next.pages[page.id];
  });
}

/**
 * Validate a book source document into normalized overrides. Sections listed
 * set the order of the nine reorderable sections; omitted sections and pages
 * keep their current settings.
 */
export function parseBookSource(identity: BrandIdentity, value: unknown, previous: BookOverrides | undefined): BookOverrides {
  const source = record(value, 'source');
  if (source.version !== undefined && source.version !== BOOK_SOURCE_VERSION) throw new RangeError(`Brand book source version ${String(source.version)} is not supported.`);
  if (source.sections === undefined) return previous ?? {};
  if (!Array.isArray(source.sections)) throw new TypeError('sections must be an array.');
  const structure = readStructure(source.structure ?? previous?.structure);
  const defined = definitionsForBook(identity, structure);
  const context: BookParseContext = {
    images: bookImageAssetIds(identity),
    next: { pages: { ...previous?.pages }, sections: { ...previous?.sections } },
    pagesById: new Map(Object.values(defined).flat().map((page) => [page.id, page])),
    resolvedById: new Map(resolveBook(identity, { structure: { ...structure, removedPages: [], removedSections: [] } }).flatMap((section) => section.pages).map((page) => [page.id, page])),
  };
  if (source.archivedPages !== undefined) {
    for (const [id, raw] of Object.entries(record(source.archivedPages, 'archivedPages'))) {
      const page = context.pagesById.get(id);
      if (!page || !(structure?.removedPages?.includes(id) || structure?.removedSections?.includes(page.group))) {
        throw new RangeError('Unknown or active page in brand book archive.');
      }
      const stored = parsePage(record(raw, 'archivedPages.' + id), page, context.resolvedById.get(id)!, context.images, 'archivedPages.' + id);
      if (stored) context.next.pages[id] = stored;
    }
  }
  const order: string[] = [];
  source.sections.forEach((entry, sectionIndex) => {
    const path = `sections.${sectionIndex}`;
    const section = record(entry, path);
    const id = String(section.id);
    if (!Object.hasOwn(defined, id)) throw new RangeError(`${path}.id must be one of intro, ${BOOK_SECTION_IDS.join(', ')}, closing.`);
    if (id !== 'intro' && id !== 'closing') {
      order.push(id as BookSectionId);
      parseSectionVisibility(section, id as BookSectionId, path, context);
    }
    parseSectionPages(section.pages, id, path, context);
  });
  const next: BookOverrides = { ...context.next, ...(structure ? { structure } : {}) };
  const completeOrder = [...order, ...sectionOrder({ ...previous, structure }).filter((id) => !order.includes(id))];
  if (completeOrder.join() !== sectionOrder({structure}).join()) next.sectionOrder = completeOrder;
  if (Object.keys(context.next.pages).length === 0) delete next.pages;
  if (Object.keys(context.next.sections).length === 0) delete next.sections;
  return next;
}

/** Keep only persisted edits that still validate against the identity. */
export function sanitizeBookOverrides(identity: BrandIdentity, value: unknown): BookOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const input = value as BookOverrides;
    const structure = readStructure(input.structure);
    // Validate retained settings independently of the current page visibility.
    const complete = structure ? { ...structure, removedPages: [], removedSections: [] } : undefined;
    const images = bookImageAssetIds(identity);
    const source = bookSource(identity, { ...input, structure: complete });
    for (const section of source.sections) for (const page of section.pages) {
      if (page.assetId && !images.includes(page.assetId)) page.assetId = '';
    }
    const parsed = parseBookSource(identity, source, undefined);
    if (structure) parsed.structure = structure;
    if (!visibleBookPages(resolveBook(identity, parsed)).length && !resolveBook(identity, parsed).some(section => section.pages.length)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function updateBookPage(identity: BrandIdentity, overrides: BookOverrides, pageId: string, patch: BookPageOverride): BookOverrides {
  const current = overrides.pages?.[pageId] ?? {};
  const merged: BookPageOverride = { ...current, ...patch, copy: patch.copy ? { ...current.copy, ...patch.copy } : current.copy };
  return sanitizeBookOverrides(identity, { ...overrides, pages: { ...overrides.pages, [pageId]: merged } });
}

export function resetBookPage(overrides: BookOverrides, pageId: string): BookOverrides {
  if (!overrides.pages?.[pageId]) return overrides;
  const pages = { ...overrides.pages };
  delete pages[pageId];
  return { ...overrides, pages };
}

export function updateBookSection(overrides: BookOverrides, sectionId: string, patch: { hidden?: boolean; move?: -1 | 1 }): BookOverrides {
  const next: BookOverrides = { ...overrides, sections: { ...overrides.sections } };
  if (patch.hidden !== undefined) {
    if (patch.hidden) next.sections![sectionId] = { hidden: true };
    else delete next.sections![sectionId];
  }
  if (patch.move) {
    const order = sectionOrder(overrides);
    const index = order.indexOf(sectionId);
    const target = index + patch.move;
    if (target >= 0 && target < order.length) {
      order.splice(index, 1);
      order.splice(target, 0, sectionId);
      next.sectionOrder = order;
    }
  }
  if (next.sectionOrder?.join() === BOOK_SECTION_IDS.join()) delete next.sectionOrder;
  if (Object.keys(next.sections!).length === 0) delete next.sections;
  return next;
}
