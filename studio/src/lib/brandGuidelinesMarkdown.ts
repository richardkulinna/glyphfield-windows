import { type BrandIdentity, brandTypographyFamily, brandTypographyRole } from './brandIdentity';
import { auditBrandHealth, brandContrastResults } from './brandHealth';
import { brandKitManifest, printableSource, shareableBrandSource } from './brandKitManifest';
import { brandRoleTypeStep, brandTypeScale } from './brandTokens';
import { COLOR_MODES, resolveSemanticColors, SEMANTIC_COLOR_ROLES, semanticContrastChecks } from './colorSystem';

function table(headings: string[], rows: (string | number | undefined)[][]): string {
  const cell = (value: string | number | undefined) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return [headings, headings.map(() => '---'), ...rows].map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n');
}

function codeBlock(content: string, syntax: string): string {
  let length = 3;
  for (const run of content.matchAll(/`+/g)) length = Math.max(length, run[0].length + 1);
  const fence = '`'.repeat(length);
  return `${fence}${syntax}\n${content}\n${fence}`;
}

function block(label: string, content?: string | readonly string[]): string {
  const value = typeof content === 'string' ? content : content?.map((line) => `- ${line}`).join('\n');
  return value?.length ? `### ${label}\n\n${value}` : '';
}

function section(title: string, ...parts: string[]): string {
  return [`## ${title}`, ...parts.filter(Boolean)].join('\n\n');
}

function contrastSummary(identity: BrandIdentity): string {
  const modes = COLOR_MODES.map((mode) => [mode, resolveSemanticColors(identity, mode)] as const);
  const rows = SEMANTIC_COLOR_ROLES.map(({ id, usage }) => [
    `\`--brand-${id}\``,
    ...modes.map(([, colors]) => `${colors[id].ref} (${colors[id].hex})`),
    usage,
  ]);
  const problems = modes.flatMap(([mode, colors]) => semanticContrastChecks(colors)
    .filter((item) => !item.passes)
    .map((item) => `${mode}, ${item.foreground} on ${item.background}: ${item.ratio.toFixed(2)}:1 (requires ${item.minimum}:1)`));
  return [
    block('Resolved interface roles', table(['Token', 'Light', 'Dark', 'Usage'], rows)),
    block('Contrast checks requiring attention', problems),
  ].filter(Boolean).join('\n\n');
}

const DOSSIER_FIELDS = {
  premise: 'Brand premise', personality: 'Personality', logo: 'Logo system',
  typography: 'Typography direction', color: 'Color direction', imagery: 'Image selection and treatment',
  layout: 'Layout and composition', graphicDevice: 'Graphic device', motion: 'Motion principles',
  provenance: 'Provenance and licensing', applications: 'Application recipes',
  renderingRecipe: 'Rendering recipe (in order)', prohibited: 'Do not',
} satisfies Record<keyof BrandIdentity['dossier'], string>;

function sampleExamples(samples: NonNullable<BrandIdentity['samples']>): string {
  const { person, event, code, metric, release } = samples;
  return section('Template samples',
    'Example content for templates. Treat example people, prices and events as samples.',
    person ? block('Sample person', [person.name, person.role]) : '',
    event ? block('Sample event', [event.name, event.location, event.date, ...(event.time ? [event.time] : [])]) : '',
    samples.install ? block('Install command', codeBlock(samples.install, 'text')) : '',
    code ? block(code.label || 'Code sample', codeBlock(code.snippet, 'text')) : '',
    metric ? block('Sample metric', [metric.label, metric.value, metric.change]) : '',
    ...(samples.plans ?? []).map((plan) => block(plan.name, [plan.price, ...plan.features])),
    block('Product actions', samples.actions),
    release ? block('Latest update', [release.title, ...release.items]) : '');
}

export function brandGuidelinesMarkdown(identity: BrandIdentity, project?: unknown): string {
  const portable = shareableBrandSource(identity, true);
  const report = auditBrandHealth(identity);
  const { assets, fonts } = brandKitManifest(identity);
  const filenames = new Map(assets.map((entry) => [entry.asset, entry.name]));
  const usedFonts = new Map(fonts.map(({ font }) => [font.id, font]));
  const { strategy, voice, graphicSystem } = identity;
  const sections = [
    `# ${identity.name} brand guidelines`,
    `Project \`${identity.id}\`. Glyphfield brand health ${report.score}/100 (${report.grade}).`,
    project === undefined ? 'Scope: brand identity only. Studio tool drafts and saved designs were not supplied.' : 'Scope: brand identity and supplied project documents. Tool drafts and sample content are labeled separately.',
    'Use the authored brand guidance for this project. Calculated values are labeled. File references point into the accompanying ZIP when supplied.',
    section('Identity essentials',
      block('Brand name', identity.name), block('Short name', identity.shortName), block('Website', identity.website),
      block('Contact email', identity.contactEmail), block('Social handle', identity.socialHandle),
      block('Tagline', identity.tagline), block('Positioning', identity.positioning), block('Mission', identity.mission),
      block('Description', identity.description)),
    section('Strategy', block('Challenge', strategy.challenge), block('Central concept', strategy.concept),
      block('Brand promise', strategy.promise), block('Desired outcome', strategy.outcome),
      block('Strategic pillars', strategy.pillars), block('Personality traits', strategy.personality), block('Brand values', identity.values)),
    section('Voice and copy', block('Voice principles', voice.principles), block('Approved phrases', voice.phrases),
      block('Avoid', voice.avoid), block('Greetings', identity.greetings),
      ...(voice.examples ?? []).map((example) => [`### ${example.context}`, `**Write**\n\n${example.write}`, `**Avoid**\n\n${example.avoid}`].join('\n\n'))),
    section('Brand dossier', ...Object.entries(DOSSIER_FIELDS).map(([key, label]) => block(label, identity.dossier[key as keyof BrandIdentity['dossier']]))),
    section('Graphic system', block('Recognizable device', graphicSystem.device), block('Selected drawing preset', graphicSystem.pattern),
      block('Device rationale', graphicSystem.description), block('Composition', graphicSystem.composition),
      block('Image direction', graphicSystem.imageDirection), block('System rules', graphicSystem.rules),
      block('Visual defaults', codeBlock(printableSource(identity.style), 'json')), block('Art direction', codeBlock(printableSource(identity.artDirection), 'json'))),
    section('Color', table(['Token', 'Hex', 'Name', 'Role', 'Share'], identity.colors.map((item) => [
      `\`--brand-color-${item.id}\``, item.hex, item.name, item.role, item.proportion === undefined ? undefined : `${item.proportion}%`,
    ])), block('Configured text pairs (measured)', table(['Foreground', 'Background', 'Use', 'Ratio', 'Result'], brandContrastResults(identity).map((pair) => [
      pair.foreground, pair.background, pair.usage, `${pair.ratio.toFixed(2)}:1`, `${pair.level} ${pair.passes ? 'pass' : 'FAIL'}`,
    ]))), contrastSummary(identity)),
    section('Typography', table(['Role', 'Family', 'File style', 'Weight', 'Leading', 'Tracking (px)', 'Size token', 'Usage'], identity.typography.map(({ role }) => {
      const selected = brandTypographyRole(identity, role);
      return [role, brandTypographyFamily(identity, role), selected.fontId ? usedFonts.get(selected.fontId)?.style : undefined, selected.weight, selected.lineHeight,
        selected.letterSpacing, `\`--brand-text-${brandRoleTypeStep(identity, role)}\``, selected.usage];
    })), block('Computed type scale', brandTypeScale(identity).map(({ name, px }) => `${name}: ${px}px`)),
    block('Font inventory', table(['Label', 'Family', 'Style', 'File name', 'Kit path', 'License'], fonts.map(({ font, include, name }) => [
      font.label, font.family, font.style, font.fileName, include ? name : 'Not packaged', font.license,
    ])))),
    section('Logos and asset inventory', table(['ID', 'Label', 'Type', 'Usage', 'Redistribution', 'Kit path'], [...identity.assets, ...identity.proofAssets].map((item) => [
      item.id, item.label, item.type, item.usage, item.redistribution, filenames.has(item) ? `\`${filenames.get(item)}\`` : 'Metadata only',
    ]))),
    section('Audience, products and proof', block('Audiences', identity.audiences), block('Products', identity.products),
      ...(identity.productDetails ?? []).map((product) => block(product.name, product.summary)), block('Customers', identity.customers),
      block('Proof statements', identity.proof), block('Sources', identity.sourceNotes)),
    section('Applications', ...identity.applications.map((item) => block(item.name, [item.category, item.format, item.description].join('\n\n')))),
  ];
  if (identity.samples) sections.push(sampleExamples(identity.samples));
  if (identity.references.length) sections.push(section('Research references', codeBlock(printableSource(identity.references), 'json')));
  if (identity.motion.length) sections.push(section('Motion', codeBlock(printableSource(identity.motion), 'json')));
  sections.push(section('Identity source', 'Field names, array order, original text, empty values, and additional project-specific fields are preserved below. Embedded files are represented by their kit paths when distributable.', codeBlock(printableSource(portable), 'json')));
  if (project !== undefined) sections.push(section('Project drafts and saved documents', codeBlock(printableSource(project), 'json')));
  return sections.filter(Boolean).join('\n\n') + '\n';
}

