// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { createBrandIdentity, hydrateBrandIdentities, type BrandIdentity } from '../brandIdentity';
import { brandAgentSetupPrompt, brandProjectUrl, brandSetupMode } from '../brandAgentSetup';
import {
  addBrandAssetFromFile,
  addBrandFontFromFile,
  createBrandKitArtifact,
  detectFontFormat,
  familyFromFontFileName,
  parseBrandApplyInput,
} from '../brandIdentityActions';
import {
  brandGuidelinesMarkdown,
  brandKitFiles,
  brandKitIncludedFonts,
  brandLogoFileName,
} from '../brandKit';
import { BrandSourceValidationError } from '../brandSource';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 1, 2, 3, 4]);

function svgFile(name = 'mark.svg') {
  return new File([SVG], name, { type: 'image/svg+xml' });
}

async function acme(): Promise<BrandIdentity> {
  let identity = createBrandIdentity('Acme', 'acme');
  identity = (await addBrandAssetFromFile(identity, { file: svgFile(), slot: 'mark-dark' })).identity;
  identity = (await addBrandFontFromFile(identity, {
    file: new File([WOFF2], 'AcmeSans-Variable.woff2'),
    weightMin: 100, weightMax: 900,
    license: 'SIL Open Font License 1.1',
    roles: ['Display', 'Body'],
  })).identity;
  return identity;
}

describe('identity.asset.add', () => {
  it('replaces a logo slot in place from file bytes', async () => {
    const identity = createBrandIdentity('Acme', 'acme');
    const { asset, identity: next } = await addBrandAssetFromFile(identity, { file: svgFile(), slot: 'mark-light', sourceUrl: 'https://acme.test/brand' });
    expect(asset).toMatchObject({ id: 'mark-light', label: 'Acme mark for dark surfaces', surface: 'dark', type: 'logo' });
    expect(asset.path).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(next.assets.map(({ id }) => id)).toEqual(identity.assets.map(({ id }) => id));
    expect(next.assets.find(({ id }) => id === 'mark-light')?.label).not.toContain('Generated pixel mark');
  });

  it('adds proof assets separately and rejects paths, bad bytes and bad enums', async () => {
    const identity = createBrandIdentity('Acme', 'acme');
    const { identity: next } = await addBrandAssetFromFile(identity, { file: svgFile('customer.svg'), id: 'customer', type: 'proof' });
    expect(next.proofAssets.map(({ id }) => id)).toEqual(['customer']);
    await expect(addBrandAssetFromFile(identity, { file: '/Users/me/logo.svg' })).rejects.toThrow(/Filesystem paths and URLs are not accepted/);
    await expect(addBrandAssetFromFile(identity, { file: new File(['nope'], 'x.png') })).rejects.toThrow(/not a supported/);
    await expect(addBrandAssetFromFile(identity, { file: svgFile(), slot: 'wordmark-dark' })).rejects.toThrow(/slot must be one of/);
  });
});

describe('identity.font.add', () => {
  it('sniffs the format, preserves a supplied variable range and binds roles', async () => {
    const identity = await acme();
    const font = identity.fonts!.at(-1)!;
    expect(font).toMatchObject({ family: 'AcmeSans', format: 'woff2', license: 'SIL Open Font License 1.1', weightMax: 900, weightMin: 100 });
    expect(identity.typography.find(({ role }) => role === 'Display')).toMatchObject({ family: 'AcmeSans', fontId: font.id });
    expect(identity.typography.find(({ role }) => role === 'Code')?.fontId).toBe('geist-mono-variable');
    expect(detectFontFormat(new Uint8Array([0, 1, 0, 0]))).toBe('truetype');
    expect(familyFromFontFileName('Acme_Grotesk-SemiBold.otf')).toBe('Acme Grotesk');
    await expect(addBrandFontFromFile(identity, { file: new File(['text'], 'a.woff2') })).rejects.toThrow(/not a TTF, OTF, WOFF or WOFF2/);
  });
});

describe('identity.apply input', () => {
  it('requires a wrapped patch and rejects stray keys', () => {
    expect(() => parseBrandApplyInput({ tagline: 'x' })).toThrow(/requires \{ identity: patch \}/);
    expect(() => parseBrandApplyInput({ identity: {}, force: true })).toThrow(/does not accept force/);
    expect(parseBrandApplyInput({ identity: {}, mode: 'merge', save: true })).toMatchObject({ mode: 'merge', save: true });
  });

  it('exposes every validation issue on the thrown error', async () => {
    const { applyBrandIdentityInput } = await import('../brandIdentityActions');
    try {
      applyBrandIdentityInput(createBrandIdentity('Acme', 'acme'), { identity: { colors: [{ hex: 'red', id: 'ink' }] } });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(BrandSourceValidationError);
      expect((error as BrandSourceValidationError).issues[0]).toMatchObject({ path: 'colors[0].hex' });
    }
  });
});

describe('brand kit', () => {
  it('packages guidelines, tokens, identity, logos and only redistributable fonts', async () => {
    const identity = await acme();
    const files = await brandKitFiles(identity, async () => new Uint8Array([1, 2, 3]));
    expect(files.map(({ name }) => name)).toEqual([
      'brand.md',
      'tokens/tokens.json',
      'tokens/brand.css',
      'tokens/tailwind.css',
      'identity.json',
      'logos/mark-dark.svg',
      'logos/mark-light.svg',
      'fonts/Inter-Variable.ttf',
      'fonts/GeistMono-Variable.ttf',
      'fonts/AcmeSans-Variable.woff2',
    ]);
    expect(brandKitIncludedFonts(identity).map(({ family }) => family)).toEqual(['Inter', 'Geist Mono', 'AcmeSans']);
    const css = new TextDecoder().decode(files[2]!.bytes);
    expect(css).toContain('src: url("../fonts/AcmeSans-Variable.woff2") format("woff2");');
    const ramp = hydrateBrandIdentities(null).find(({ id }) => id === 'ramp')!;
    // Only the open-licensed code face ships; the commercial Lausanne files never do.
    expect(brandKitIncludedFonts(ramp).map(({ family }) => family)).toEqual(['IBM Plex Mono']);
    expect(new TextDecoder().decode((await brandKitFiles(ramp, async () => new Uint8Array([1]))).find(({ name }) => name === 'tokens/brand.css')!.bytes))
      .toContain('Lausanne Book is not included.');
  });

  it('writes brand.md for coding agents with tokens, contrast and logo rules', () => {
    const gt = hydrateBrandIdentities(null).find(({ id }) => id === 'gt')!;
    const markdown = brandGuidelinesMarkdown(gt);
    expect(markdown).toMatch(/^# General Translation brand guidelines\n/);
    for (const heading of ['## Brand dossier', '## Voice and copy', '## Color', '## Typography', '## Logos', '## Identity source']) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain('`--brand-color-ink`');
    expect(markdown).toContain('`logos/mark-dark.svg`');
    expect(brandLogoFileName({ id: 'mark-light', path: 'data:image/png;base64,AA' })).toBe('logos/mark-light.png');
  });

  it('exports semantic roles and the type step without inserting unrelated writing rules', () => {
    const gt = hydrateBrandIdentities(null).find(({ id }) => id === 'gt')!;
    const markdown = brandGuidelinesMarkdown({ ...gt, typeScale: { basePx: 16, ratio: 1.25, roleSteps: { Display: 'h1' } } });
    expect(markdown).toContain('`--brand-background`');
    expect(markdown).toContain('`--brand-primary-foreground`');
    expect(markdown).toContain('`--brand-text-h1`');
    expect(markdown).not.toContain('Never add positive tracking to lowercase text.');
  });

  it('retains complete identity fields, exact rules and project drafts while keeping file bytes out of Markdown', async () => {
    const identity = await acme();
    identity.description = 'Line one.\n\nLine two | another value';
    identity.shortName = 'AC';
    identity.greetings = ['Hallo [Vorname],'];
    identity.dossier.prohibited = ['Keine dekorativen Schlagschatten verwenden.'];
    identity.dossier.renderingRecipe = ['Second is a deliberate name', 'First is another name'];
    identity.samples = { code: { label: 'Fenced code', snippet: 'a\n```\nb' } };
    const project = { drafts: { book: { visible: false, pageCount: 0, settings: null, notes: [], custom: 'studio-only' } } };
    const extra = { futureEditor: { unrecognizedSetting: 'future-output' } };
    const md = brandGuidelinesMarkdown({ ...identity, ...extra }, project);
    expect(md).toContain(identity.description);
    expect(md).toContain('- Keine dekorativen Schlagschatten verwenden.');
    expect(md).not.toContain('Avoid: Keine');
    expect(md).not.toMatch(/data:[^,\s]*;base64,/i);
    const codeBlocks = [...md.matchAll(/^(`{3,})json\n([\s\S]*?)\n\1$/gm)].map((match) => JSON.parse(match[2]!));
    const model = codeBlocks.find((source) => source.id === identity.id);
    expect(model).toMatchObject({ ...extra, description: identity.description, shortName: 'AC', greetings: identity.greetings, samples: identity.samples, dossier: { renderingRecipe: identity.dossier.renderingRecipe } });
    expect(codeBlocks).toContainEqual(project);
    const zipMd = (await brandKitFiles({ ...identity, ...extra }, async () => new Uint8Array([1]), project)).find((file) => file.name === 'brand.md');
    expect(new TextDecoder().decode(zipMd!.bytes)).toBe(md);
  });

  it('excludes restricted bytes in all shareable files and preserves files with colliding names', async () => {
    const identity = await acme();
    const embedded = 'data:image/png;base64,V0lUSEhFTEQ=';
    const asset = { ...identity.assets[0]!, path: embedded, id: 'restricted-logo', redistribution: 'research-only' as const };
    identity.assets.push(asset, { ...asset, id: 'other-copy', redistribution: 'original' });
    identity.proofAssets.push({ ...asset, id: 'proof-source', type: 'proof', redistribution: 'url-only' });
    const primary = identity.fonts!.at(-1)!;
    const second = { ...primary, id: 'different-weight-file', fileName: primary.fileName.toUpperCase() };
    const privateFont = { ...primary, id: 'private-upload', license: 'not OFL: commercial desktop', path: 'data:font/woff2;base64,UFJJVkFURQ==' };
    identity.fonts!.push(second, privateFont);
    identity.typography.find((entry) => entry.role === 'Accent')!.fontId = second.id;
    identity.typography.find((entry) => entry.role === 'Code')!.fontId = privateFont.id;
    const files = await brandKitFiles(identity, async () => new Uint8Array([0]), { source: { image: embedded } });
    const names = files.map((entry) => entry.name);
    expect(names.filter((name) => /fonts\/acmesans-variable/i.test(name))).toHaveLength(2);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
    expect(names).not.toContain('logos/restricted-logo.png');
    expect(names).not.toContain('logos/other-copy.png');
    for (const file of files) {
      const content = new TextDecoder().decode(file.bytes);
      expect(content).not.toMatch(/V0lUSEhFTEQ=|UFJJVkFURQ==/);
    }
    const source = JSON.parse(new TextDecoder().decode(files.find((file) => file.name === 'identity.json')!.bytes));
    expect(source.assets.find((entry: { id: string }) => entry.id === asset.id)).toMatchObject({ path: '', redistribution: 'research-only' });
    const css = new TextDecoder().decode(files.find((file) => file.name === 'tokens/brand.css')!.bytes);
    for (const name of names.filter((item) => /fonts\/acmesans-variable/i.test(item))) expect(css).toContain('../' + name);
  });

  it('creates zip and single-file artifacts with matching names and MIME types', async () => {
    const identity = await acme();
    const load = async () => new Uint8Array([60, 115, 118, 103]);
    const zip = await createBrandKitArtifact(identity, 'zip', load);
    expect(zip).toMatchObject({ fileName: 'acme-brand-kit.zip' });
    expect(zip.blob.type).toBe('application/zip');
    const head = new Uint8Array(await zip.blob.arrayBuffer()).slice(0, 4);
    expect([...head]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const tokens = await createBrandKitArtifact(identity, 'dtcg', load);
    expect(tokens).toMatchObject({ fileName: 'acme-tokens.json' });
    expect(JSON.parse(tokens.previewText!)).toHaveProperty('color.ink.$type', 'color');
    expect((await createBrandKitArtifact(identity, 'markdown', load)).fileName).toBe('brand.md');
    expect((await createBrandKitArtifact(identity, 'tailwind', load)).blob.type).toBe('text/css');
  });
});

describe('agent setup prompt', () => {
  it('writes a self-contained prompt for a new project', () => {
    const identity = createBrandIdentity('Untitled brand', 'new-brand');
    expect(brandSetupMode(identity)).toBe('new');
    const prompt = brandAgentSetupPrompt({ identity, origin: 'http://localhost:3071' });
    expect(prompt).toContain('Set up my brand in Glyphfield');
    expect(prompt).toContain(brandProjectUrl(identity, 'http://localhost:3071'));
    for (const action of ['identity.validate', 'identity.apply', 'identity.asset.add', 'identity.font.add', 'identity.audit', 'identity.fix', 'identity.save', 'identity.export.kit']) {
      expect(prompt).toContain(action);
    }
    expect(prompt).toContain('Never invent customers, metrics, claims or slogans');
    for (const field of ['colorSystem.light', 'colorSystem.dark', 'roleSteps', 'opticalSize', 'never positive tracking on lowercase']) {
      expect(prompt).toContain(field);
    }
  });

  it('switches to improvement mode for an existing brand', () => {
    const gt = hydrateBrandIdentities(null).find(({ id }) => id === 'gt')!;
    expect(brandSetupMode(gt)).toBe('improve');
    const prompt = brandAgentSetupPrompt({ identity: gt, report: { counts: { error: 0, info: 2, warning: 1 }, score: 92 } });
    expect(prompt).toContain('the "General Translation" brand');
    expect(prompt).toContain('92/100');
    expect(prompt).toContain('run identity.read and identity.audit first');
  });
});
