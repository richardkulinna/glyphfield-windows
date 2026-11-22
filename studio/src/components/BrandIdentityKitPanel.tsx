'use client';

import { useEffect, useState } from 'react';
import { T, useGT } from 'gt-next';

import { Panel } from '@/components/BrandIdentityFields';
import { Button } from '@/components/ui/Button';
import { Copy, Download, FileJson, FileText, Package } from '@/components/ui/SolidIcons';
import type { BrandIdentity } from '@/lib/brandIdentity';
import { BRAND_KIT_FILE_NAMES, brandKitArtworkAssets, brandKitIncludedFonts, brandKitLogoAssets, brandKitTextFile, type BrandKitFormat } from '@/lib/brandKit';

import styles from './BrandIdentityStudio.module.css';

type TextFormat = Exclude<BrandKitFormat, 'logos' | 'zip'>;

const OUTPUTS: readonly { description: string; format: BrandKitFormat; icon: typeof Package; label: string }[] = [
  { description: 'Shareable project guidelines, tokens, portable identity metadata and files cleared for redistribution.', format: 'zip', icon: Package, label: 'Brand kit (.zip)' },
  { description: 'Complete brand guidance for agents, with editable project settings, drafts and design versions.', format: 'markdown', icon: FileText, label: 'brand.md' },
  { description: 'W3C Design Tokens (DTCG 2025.10) for Style Dictionary, Tokens Studio and other tools.', format: 'dtcg', icon: FileJson, label: 'Design tokens (JSON)' },
  { description: 'CSS custom properties prefixed --brand-, with @font-face rules for the kit fonts.', format: 'css', icon: FileText, label: 'CSS variables' },
  { description: 'A Tailwind CSS v4 @theme block: bg-paper, text-ink, font-display, text-display.', format: 'tailwind', icon: FileText, label: 'Tailwind v4 theme' },
  { description: 'Logo files cleared for redistribution, with stable filenames.', format: 'logos', icon: Package, label: 'Logo pack (.zip)' },
];

const PREVIEWS: readonly { format: TextFormat; label: string }[] = [
  { format: 'markdown', label: BRAND_KIT_FILE_NAMES.markdown },
  { format: 'dtcg', label: BRAND_KIT_FILE_NAMES.dtcg },
  { format: 'css', label: BRAND_KIT_FILE_NAMES.css },
  { format: 'tailwind', label: BRAND_KIT_FILE_NAMES.tailwind },
];

export default function BrandIdentityKitPanel({
  busyFormat,
  identity,
  onCopy,
  onExport,
}: {
  busyFormat: BrandKitFormat | null;
  identity: BrandIdentity;
  onCopy: (text: string, confirmation: string) => void;
  onExport: (format: BrandKitFormat) => void;
}) {
  const gt = useGT();
  const [preview, setPreview] = useState<TextFormat>('markdown');
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ identity: BrandIdentity; generation: number; text?: string; error?: string } | null>(null);
  useEffect(() => {
    if (preview !== 'markdown') return;
    let active = true;
    async function prepare() {
      try {
        const { captureStudioProjectExport } = await import('@/lib/studioProjectExport');
        const project = await captureStudioProjectExport(identity.id);
        const text = new TextDecoder().decode(brandKitTextFile(identity, 'markdown', project).bytes);
        if (active) setResult({ identity, generation, text });
      } catch (error) {
        if (active) setResult({ identity, generation, error: error instanceof Error ? error.message : 'Could not read the project.' });
      }
    }
    void prepare();
    return () => { active = false; };
  }, [generation, identity, preview]);
  const current = result?.identity === identity && result.generation === generation ? result : null;
  const previewText = preview === 'markdown' ? current?.text : new TextDecoder().decode(brandKitTextFile(identity, preview).bytes);
  const logos = brandKitLogoAssets(identity).length;
  const fonts = brandKitIncludedFonts(identity).length;
  const artwork = brandKitArtworkAssets(identity).length;

  return (
    <div className={styles.sectionStack}>
      <Panel description={gt('{logos} logo files, {artwork} artwork files and {fonts} font files are packaged. The ZIP includes files cleared for redistribution. The project source keeps a record of other assets.', { artwork, fonts, logos })} title={<T>Files</T>}>
        <ul className={styles.kitList}>
          {OUTPUTS.map((output) => {
            const Icon = output.icon;
            return (
              <li key={output.format}>
                <Icon aria-hidden='true' />
                <span><strong>{gt(output.label)}</strong><small>{gt(output.description)}</small></span>
                <Button
                  aria-label={gt('Download {label}', { label: output.label })}
                  disabled={busyFormat !== null}
                  loading={busyFormat === output.format}
                  onClick={() => onExport(output.format)}
                  size='sm'
                  type='button'
                  variant={output.format === 'zip' ? 'default' : 'outline'}
                >
                  <Download aria-hidden='true' /><T>Download</T>
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>
      <Panel
        actions={(
          <>
            {preview === 'markdown' && <Button onClick={() => setGeneration((n) => n + 1)} size='sm' type='button' variant='outline'><T>Refresh preview</T></Button>}
            <Button disabled={previewText === undefined} onClick={() => { if (previewText !== undefined) onCopy(previewText, gt('Copied.')); }} size='sm' type='button' variant='outline'>
              <Copy aria-hidden='true' /><T>Copy</T>
            </Button>
          </>
        )}
        description={<T>The Markdown preview includes this project's drafts and saved design versions. Copy it or download the file.</T>}
        title={<T>Preview</T>}
      >
        <div aria-label={gt('Kit file preview')} className={styles.segmented} role='group'>
          {PREVIEWS.map((item) => (
            <button aria-pressed={preview === item.format} key={item.format} onClick={() => setPreview(item.format)} type='button'>{item.label}</button>
          ))}
        </div>
        <pre aria-label={gt('Kit file contents')} className={`studio-scroll-area ${styles.codeBlock}`} tabIndex={0}>{previewText ?? (current?.error || gt('Reading project...'))}</pre>
      </Panel>
    </div>
  );
}
