'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Grid2X2,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
} from '@/components/ui/SolidIcons';
import { T, useGT } from 'gt-next';
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';

import { brandTypographyFamily, brandTypographyRole, type BrandIdentity } from '@/lib/brandIdentity';
import {
  BOOK_SOURCE_SCHEMA,
  BOOK_VARIANT_LABELS,
  bookImageAssetIds,
  bookSource,
  parseBookSource,
  resetBookPage,
  resolveBook,
  sanitizeBookOverrides,
  bookPageDefinitions,
  updateBookPage,
  updateBookSection,
  visibleBookPages,
  type BookOverrides,
  type BookPage,
  type BookSection,
  type BookPageOverride,
} from '@/lib/brandBookModel';
import { BRAND_SURFACE_TONE_LABELS, BRAND_SURFACE_TONES, brandPalette, brandSurface, trackingFor, type BrandSurfaceTone } from '@/lib/brandOutputKit';
import { parseSourceObject, stringifySource } from '@/lib/sourceCode';
import type { StudioTool } from '@/lib/studioCatalog';
import { studioToolActionNames } from '@/lib/studioAgentCapabilities';
import { registerStudioAutomation } from '@/lib/studioAutomation';
import { capVisibleFontWeight } from '@/lib/typography';
import { useCommittedRef } from '@/hooks/useCommittedRef';
import { useStudioDraft } from '@/hooks/usePersistentState';

import { BookStructureControls, type ArchivedBookEntry } from './BookStructureControls';
import { BookColorField, LayoutInspector, type AddBookAssets } from './BookLayoutEditor';
import { BOOK_LOGO_RULES } from '@/lib/bookLogoRules';
import { BookPageView, type BookPageContext } from './brandBookPages';
import { LabInspectorSection, StudioSidebar } from './LabWorkspace';
import SourceCodeDrawer from './LazySourceCodeDrawer';
import StudioFileMenu from './StudioFileMenu';
import StudioToolHeader from './StudioToolHeader';
import ThemeAwareBrandMark from './ThemeAwareBrandMark';
import { Button } from './ui/Button';
import StudioCheckbox from './ui/StudioCheckbox';
import StudioRange from './ui/StudioRange';
import StudioSelect from './ui/StudioSelect';

import styles from './BrandBook.module.css';

type BookMode = 'overview' | 'reader';

type ReaderEntry = { page: BookPage; section: BookSection };

function sectionNumbers(sections: readonly BookSection[]): Map<string, string> {
  const numbers = new Map<string, string>();
  let index = 0;
  for (const section of sections) {
    if (section.id === 'intro' || section.id === 'closing' || section.hidden) continue;
    index += 1;
    numbers.set(section.id, String(index).padStart(2, '0'));
  }
  return numbers;
}

function rootStyle(identity: BrandIdentity, thumbnailWidth: number): CSSProperties {
  const palette = brandPalette(identity);
  const display = brandTypographyRole(identity, 'Display');
  const body = brandTypographyRole(identity, 'Body');
  const code = brandTypographyRole(identity, 'Code');
  const accent = brandTypographyRole(identity, 'Accent');
  return {
    '--book-accent': palette.accent,
    '--book-accent-font': `'${brandTypographyFamily(identity, 'Accent')}', var(--book-display)`,
    '--book-accent-weight': capVisibleFontWeight(accent.weight ?? 400),
    '--book-body': `'${brandTypographyFamily(identity, 'Body')}', sans-serif`,
    '--book-body-weight': capVisibleFontWeight(body.weight ?? 400),
    '--book-code': `'${brandTypographyFamily(identity, 'Code')}', monospace`,
    '--book-code-weight': capVisibleFontWeight(code.weight ?? 400),
    '--book-deep': palette.deep,
    '--book-display': `'${brandTypographyFamily(identity, 'Display')}', sans-serif`,
    '--book-display-leading': display.lineHeight ?? 1,
    '--book-display-tracking': `${trackingFor(100, display.letterSpacing) / 100}em`,
    '--book-display-weight': capVisibleFontWeight(display.weight ?? 500),
    '--book-ink': palette.ink,
    '--book-muted': palette.muted,
    '--book-paper': palette.paper,
    '--book-radius': `${Math.min(identity.style?.borderRadius ?? 6, 12) / 16}cqi`,
    '--book-thumb-width': `${thumbnailWidth}px`,
  } as CSSProperties;
}

export default function BrandBook({ identity, tool, onAddAssets }: { identity: BrandIdentity; tool: StudioTool; onAddAssets?: AddBookAssets }) {
  const gt = useGT();
  const scope = `bb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const studioRootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<BookMode>('overview');
  const [currentPageId, setCurrentPageId] = useState<string>('cover');
  const [thumbnailWidth, setThumbnailWidth] = useState(272);
  const [selectedLayer, setSelectedLayer] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [exportError, setExportError] = useState('');
  const exportBusy = useRef(false);

  const templates = useMemo(() => Object.values(bookPageDefinitions(identity)).flat(), [identity]);
  const [sourceOpen, setSourceOpen] = useState(false);
  // Overview rows far from the viewport render placeholders; printing renders every page.
  const [printing, setPrinting] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const [storedOverrides, setStoredOverrides] = useStudioDraft<BookOverrides>(identity.id, tool.id, 'book', {});
  const overrides = useMemo(() => sanitizeBookOverrides(identity, storedOverrides), [identity, storedOverrides]);
  const sections = useMemo(() => resolveBook(identity, overrides), [identity, overrides]);
  const archived = useMemo<ArchivedBookEntry[]>(() => {
    const structure = overrides.structure;
    if (!structure?.removedPages?.length && !structure?.removedSections?.length) return [];
    const complete = resolveBook(identity, { ...overrides, structure: { ...structure, removedPages: [], removedSections: [] } });
    return complete.flatMap(section => [
      ...(structure.removedSections?.includes(section.id) ? [{ id: section.id, group: section.id, title: section.name, kind: 'section' as const }] : []),
      ...section.pages.filter(page => structure.removedPages?.includes(page.id)).map(page => ({ id: page.id, group: section.id, title: page.title, kind: 'page' as const })),
    ]);
  }, [identity, overrides]);
  const palette = useMemo(() => brandPalette(identity), [identity]);
  const visible = useMemo(() => visibleBookPages(sections), [sections]);
  const folios = useMemo(() => new Map(visible.map((page) => [page.id, page.folio])), [visible]);
  const numbers = useMemo(() => sectionNumbers(sections), [sections]);
  const readerPages = useMemo<ReaderEntry[]>(() => sections.flatMap((section) => section.pages.map((page) => ({ page, section }))), [sections]);
  const currentIndex = Math.max(0, readerPages.findIndex(({ page }) => page.id === currentPageId));
  const current = readerPages[currentIndex]!;
  const imageOptions = useMemo(() => {
    const labels = new Map(identity.assets.map((asset) => [asset.id, asset.label]));
    return bookImageAssetIds(identity).map((id) => ({ label: labels.get(id) ?? id, value: id }));
  }, [identity]);
  const style = rootStyle(identity, thumbnailWidth);

  function commit(next: BookOverrides) {
    setStoredOverrides(next);
  }

  function onCopy(pageId: string, slot: string, value: string) {
    commit(updateBookPage(identity, overrides, pageId, { copy: { [slot]: value } }));
  }

  // Stable callback identity keeps memoized pages from re-rendering on unrelated edits.
  const onCopyRef = useCommittedRef(onCopy);
  const stableOnCopy = useMemo(() => (pageId: string, slot: string, value: string) => onCopyRef.current(pageId, slot, value), [onCopyRef]);

  const overviewBase = useMemo(() => ({
    editable: false,
    folios,
    identity,
    onCopy: stableOnCopy,
    palette,
    scope,
    sections,
  }), [folios, identity, palette, scope, sections, stableOnCopy]);

  function pageContext(entry: ReaderEntry, editable: boolean): BookPageContext {
    return {
      editable,
      ...(editable ? { selectedLayer, selectLayer:setSelectedLayer, changeLayout:(layout: NonNullable<BookPageOverride['layout']>) => commit(updateBookPage(identity,overrides,entry.page.id,{layout})) } : {}),
      folios,
      identity,
      onCopy: stableOnCopy,
      page: entry.page,
      palette,
      scope,
      sectionNumber: numbers.get(entry.section.id) ?? '',
      sections,
    };
  }

  useEffect(() => {
    if (mode !== 'reader') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.target instanceof Element && event.target.closest('[role=combobox],[role=listbox],button')) return;
      if (event.key === 'ArrowLeft') setCurrentPageId(readerPages[Math.max(0, currentIndex - 1)]!.page.id);
      if (event.key === 'ArrowRight') setCurrentPageId(readerPages[Math.min(readerPages.length - 1, currentIndex + 1)]!.page.id);
      if (event.key === 'Escape') setMode('overview');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, mode, readerPages]);

  const openPage = useMemo(() => (pageId: string) => {
    setCurrentPageId(pageId);
    setMode('reader');
  }, []);

  function jumpToSection(sectionId: string) {
    const section = sections.find(({ id }) => id === sectionId);
    if (mode === 'reader') {
      if (section?.pages[0]) setCurrentPageId(section.pages[0].id);
      return;
    }
    document.getElementById(`brand-book-${identity.id}-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' });
  }

  async function exportBook(format: 'pdf' | 'pptx', propagate = false) {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExportError('');
    const previousMode = mode;
    try {
      flushSync(() => { setPrinting(true); setMode('overview'); });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const images = Array.from(canvasRef.current?.querySelectorAll('img') ?? []).filter(image => image.getAttribute('src') && !image.closest('[data-hidden]'));
      for (const image of images) image.loading = 'eager';
      await document.fonts.ready;
      const pending = new Set(images);
      const missing = new Set<HTMLImageElement>();
      const decoding = Promise.all(images.map(async image => {
        try { await image.decode(); } catch { missing.add(image); } finally { pending.delete(image); }
      }));
      // A remote reference can remain pending offline. Export the available art.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([decoding, new Promise<void>(finish => {timeout = setTimeout(finish, 5000);})]); }
      finally { clearTimeout(timeout); }
      const missingCount = pending.size + missing.size;
      let unavailable: string[] = [];
      if (format === 'pptx') {
        const { exportBookPowerPoint } = await import('@/lib/bookPowerPoint');
        if (!canvasRef.current) throw new Error('The book canvas is unavailable.');
        unavailable = await exportBookPowerPoint(canvasRef.current, identity.name, identity.fonts);
      } else if (window.glyphfieldDesktop?.saveBrandBookPdf) await window.glyphfieldDesktop.saveBrandBookPdf();
      else window.print();
      if (unavailable.length) setExportError('Unavailable images: ' + unavailable.join(', '));
      else if (missingCount) setExportError('Unavailable images in this export: '+missingCount+'. Reconnect their source or replace them in the asset library.');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not export the brand book.');
      if (propagate) throw error;
    } finally {
      setPrinting(false); setMode(previousMode); exportBusy.current = false;
    }
  }

  function createPage(mode: 'section'|'page', title: string, section: string, template: string) {
    const id = 'custom-' + crypto.randomUUID();
    const structure = overrides.structure ?? {};
    const group = mode === 'section' ? 'custom-' + crypto.randomUUID() : section;
    const chapters = mode === 'section' ? [...(structure.chapters ?? []), {id:group,name:title}] : structure.chapters;
    const blank = template === 'blank';
    const additions = [...(structure.additions ?? []), {id, group, title, template:blank ? 'foreword' : template}];
    const pages = blank ? { ...overrides.pages, [id]:{copy:{ statement:title, body:'' }} } : overrides.pages;
    commit({ ...overrides, pages, structure:{ ...structure, ...(chapters ? { chapters } : {}), additions } });
    setCurrentPageId(id); setSelectedLayer(''); setMode('reader');
  }

  function remove(kind: 'page'|'section') {
    const structure = overrides.structure ?? {};
    if (kind === 'page') {
      if (readerPages.length <= 1) return;
      commit({ ...overrides, structure:{...structure,removedPages:[...(structure.removedPages ?? []),current.page.id]} });

    } else {
      if (['intro','closing'].includes(current.section.id) || !readerPages.some(r=>r.section.id!==current.section.id)) return;
      commit({ ...overrides, structure:{...structure,removedSections:[...(structure.removedSections ?? []),current.section.id]} });

    }
    setMode('overview');
  }

  function restoreRemoval(entry: ArchivedBookEntry) {
    const structure = overrides.structure;
    if (!structure) return;
    commit({ ...overrides, structure: { ...structure,
      removedPages: structure.removedPages?.filter(id => entry.kind !== 'page' || id !== entry.id),
      removedSections: structure.removedSections?.filter(id => id !== entry.group),
    } });
    if (entry.kind === 'page') openPage(entry.id);
  }

  function movePage(delta: number) {
    const ids = current.section.pages.map(p=>p.id);
    const from = ids.indexOf(current.page.id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to,0,...ids.splice(from,1));
    commit({...overrides, structure:{...overrides.structure,pageOrders:{...overrides.structure?.pageOrders,[current.section.id]:ids}}});
  }

  useEffect(() => {
    // Browser print (Cmd+P) and print emulation also need every page rendered.
    const query = window.matchMedia('print');
    const start = () => flushSync(() => setPrinting(true));
    const end = () => setPrinting(false);
    const change = (event: MediaQueryListEvent) => (event.matches ? start() : end());
    window.addEventListener('beforeprint', start);
    window.addEventListener('afterprint', end);
    query.addEventListener('change', change);
    return () => {
      window.removeEventListener('beforeprint', start);
      window.removeEventListener('afterprint', end);
      query.removeEventListener('change', change);
    };
  }, []);

  function readSource(): string {
    return stringifySource(bookSource(identity, overrides));
  }

  function applySource(source: string) {
    const parsed = parseSourceObject(source);
    if (parsed.schema !== undefined && parsed.schema !== BOOK_SOURCE_SCHEMA) throw new RangeError(`Brand book source schema must be ${BOOK_SOURCE_SCHEMA}.`);
    commit(parseBookSource(identity, parsed, overrides));
  }

  const automationRef = useCommittedRef({ applySource, exportBook, readSource });
  useEffect(() => registerStudioAutomation({
    actions: studioToolActionNames('brand-book'),
    applySource: (source) => automationRef.current.applySource(source),
    getSource: () => automationRef.current.readSource(),
    invoke: (action) => {
      if (action !== 'brand-book.print' && action !== 'brand-book.export.pptx') throw new RangeError(`Unknown Brand book action: ${action}.`);
      return automationRef.current.exportBook(action === 'brand-book.print' ? 'pdf' : 'pptx', true).then(() => null);
    },
    toolId: 'brand-book',
  }, studioRootRef.current), [automationRef]);

  return (
    <div className={styles.root} data-brand={identity.id} data-flavor={identity.artDirection.preview} data-mode={mode} data-exporting={printing || undefined} ref={studioRootRef} style={style}>
      <StudioToolHeader
        actions={(
          <>
            <StudioFileMenu onSource={() => setSourceOpen(true)} />
            <button className={styles.pdfButton} aria-label="Export PDF" disabled={printing || !visible.length} onClick={() => void exportBook('pdf')} type='button'><Download aria-hidden='true' /><span><T>Export PDF</T></span></button>
            <button className={styles.exportButton} aria-label="Export PowerPoint" disabled={printing || !visible.length} onClick={() => void exportBook('pptx')} type="button"><Download aria-hidden="true" /><span>PowerPoint</span></button>
          </>
        )}
        context={mode === 'overview' ? (
          <label className={styles.zoomControl}>
            <Minus aria-hidden='true' />
            <StudioRange aria-label={gt('Page thumbnail size')} max='420' min='100' openMax onValueCommit={setThumbnailWidth} onChange={(event) => setThumbnailWidth(Number(event.target.value))} value={thumbnailWidth} />
            <Plus aria-hidden='true' />
          </label>
        ) : (
          <div className={styles.readerTools}><span className={styles.pageCounter}>{currentIndex + 1} / {readerPages.length}</span>
            <button type="button" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(open => !open)}>Page controls</button></div>
        )}
        metadata={`${identity.name} · ${visible.length} pages`}
        navigation={<div className={styles.modeSwitch}>
          <button aria-pressed={mode === 'overview'} onClick={() => setMode('overview')} type='button'><Grid2X2 aria-hidden='true' /><span><T>Overview</T></span></button>
          <button aria-pressed={mode === 'reader'} onClick={() => setMode('reader')} type='button'><Maximize2 aria-hidden='true' /><span><T>Edit pages</T></span></button>
        </div>}
        navigationLabel={gt('Brand book view')}
        title={gt(tool.name)}
        toolId={tool.id}
      />

      {exportError && <p role='alert'>{exportError}</p>}
      <div className={styles.body} data-inspector={(mode === 'reader' && inspectorOpen) || undefined}>
        <aside className={styles.navigator}>
          <div className={styles.navigatorIdentity}>
            <div><ThemeAwareBrandMark className={styles.navigatorMark} identity={identity} /></div>
            <span><strong>{identity.name}</strong><small>Brand book / rev. {identity.revision}</small></span>
          </div>
          <BookStructureControls sections={sections} templates={templates} currentSection={current.section.id} onCreate={createPage} archived={archived} onRestore={restoreRemoval} />
          <button className={styles.navIntroduction} onClick={() => jumpToSection('intro')} type='button'><strong>Introduction</strong><small>{sections.find(s=>s.id==='intro')?.pages.length}</small></button>
          {mode === 'reader' && <div className={styles.pageJump}><StudioSelect ariaLabel="Go to page" value={current.page.id} onValueChange={openPage} options={readerPages.map(({page, section}) => ({ value: page.id, label: section.name + ' / ' + page.title }))}/></div>}
          <nav aria-label={gt('Brand book sections')}>
            {sections.filter(s=>s.id!=='intro' && s.id!=='closing').map((section, index, order) => {
              const sectionId = section.id;
              const active = mode === 'reader' && current.section.id === sectionId;
              const count = section.pages.filter((page) => !page.hidden).length;
              return (
                <div className={styles.navRow} data-hidden={section.hidden || undefined} key={sectionId}>
                  <button aria-current={active ? 'page' : undefined} className={styles.navSection} onClick={() => jumpToSection(sectionId)} type='button'>
                    <span>{numbers.get(sectionId) ?? '··'}</span><strong>{section.name}</strong><small>{String(count).padStart(2, '0')}</small>
                  </button>
                  <span className={styles.navActions}>
                    <button aria-label={`${section.hidden ? 'Show' : 'Hide'} ${section.name} section`} onClick={() => commit(updateBookSection(overrides, sectionId, { hidden: !section.hidden }))} title={section.hidden ? 'Show section' : 'Hide section'} type='button'>{section.hidden ? <EyeOff aria-hidden='true' /> : <Eye aria-hidden='true' />}</button>
                    <button aria-label={`Move ${section.name} section earlier`} disabled={index === 0} onClick={() => commit(updateBookSection(overrides, sectionId, { move: -1 }))} type='button'><ArrowUp aria-hidden='true' /></button>
                    <button aria-label={`Move ${section.name} section later`} disabled={index === order.length - 1} onClick={() => commit(updateBookSection(overrides, sectionId, { move: 1 }))} type='button'><ArrowDown aria-hidden='true' /></button>
                  </span>
                </div>
              );
            })}
          </nav>
          <button className={styles.navIntroduction} onClick={() => jumpToSection('closing')} type="button"><strong>Closing</strong><small>{sections.find(item => item.id === 'closing')?.pages.length}</small></button>
          <div className={styles.navigatorPalette}>{identity.colors.slice(0, 8).map((color) => <span key={color.id} style={{ background: color.hex }} title={`${color.name} ${color.hex}`} />)}</div>
        </aside>

        <main className={styles.canvas} ref={canvasRef}>
          {mode === 'overview' ? (
            <div className={styles.overviewBoard}>
              {sections.map((section, index) => (
                <OverviewRow
                  base={overviewBase}
                  eager={printing || index < 3}
                  folios={folios}
                  id={`brand-book-${identity.id}-${section.id}`}
                  key={section.id}
                  onOpen={openPage}
                  root={canvasRef}
                  section={section}
                  sectionNumber={numbers.get(section.id) ?? ''}
                />
              ))}
            </div>
          ) : (
            <div className={styles.reader}>
              <button aria-label={gt('Previous page')} className={styles.readerArrow} disabled={currentIndex === 0} onClick={() => setCurrentPageId(readerPages[currentIndex - 1]!.page.id)} type='button'><ChevronLeft aria-hidden='true' /></button>
              <div className={styles.readerPage} key={current.page.id}>
                <BookPageView context={pageContext(current, true)} folio={folios.get(current.page.id)} sectionName={current.section.name} />
              </div>
              <button aria-label={gt('Next page')} className={styles.readerArrow} disabled={currentIndex === readerPages.length - 1} onClick={() => setCurrentPageId(readerPages[currentIndex + 1]!.page.id)} type='button'><ChevronRight aria-hidden='true' /></button>
            </div>
          )}
        </main>

        {mode === 'reader' && inspectorOpen ? (
          <PageInspector
            imageOptions={imageOptions}
            onAddAssets={onAddAssets}
            onPage={(patch) => commit(updateBookPage(identity, overrides, current.page.id, patch))}
            onReset={() => commit(resetBookPage(overrides, current.page.id))}
            onSection={(patch) => commit(updateBookSection(overrides, current.section.id, patch))}
            entry={current}
            identity={identity} selected={selectedLayer} select={setSelectedLayer} move={movePage}
            canRemove={readerPages.length>1} remove={remove}
          />
        ) : null}
      </div>
      {sourceOpen ? (
        <SourceCodeDrawer
          format='JSON · brand book sections, pages, layouts, surfaces, images, and copy'
          onApply={applySource}
          onClose={() => setSourceOpen(false)}
          source={readSource()}
          title={`${identity.name} brand book source`}
        />
      ) : null}
    </div>
  );
}

type OverviewRowProps = {
  base: Omit<BookPageContext, 'page' | 'sectionNumber'>;
  eager: boolean;
  folios: ReadonlyMap<string, number>;
  id: string;
  onOpen: (pageId: string) => void;
  root: RefObject<HTMLElement | null>;
  section: BookSection;
  sectionNumber: string;
};

/** A section row that only builds its pages once it nears the viewport. */
const OverviewRow = memo(function OverviewRow({ base, eager, folios, id, onOpen, root, section, sectionNumber }: OverviewRowProps) {
  const rowRef = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || near) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { root: root.current, rootMargin: '600px 0px' });
    observer.observe(row);
    return () => observer.disconnect();
  }, [near, root]);

  const render = eager || near;
  return (
    <section className={styles.overviewRow} data-hidden={section.hidden || undefined} id={id} ref={rowRef}>
      <h2 className={styles.overviewChapter}>{section.name}</h2>
      {section.pages.map((page) => (
        <button className={styles.pageButton} data-hidden={page.hidden || section.hidden || undefined} key={page.id} onClick={() => onOpen(page.id)} type='button'>
          {render
            ? <BookPageView context={{ ...base, page, sectionNumber }} folio={folios.get(page.id)} sectionName={section.name} />
            : <span aria-label={page.title} className={styles.pagePlaceholder} role='img' />}
          <span className={styles.thumbnailCaption}><strong>{folios.has(page.id) ? String(folios.get(page.id)).padStart(2, '0') : 'Hidden'}</strong>{page.title}</span>
        </button>
      ))}
    </section>
  );
});

function PageInspector({
  entry, identity, selected, select, move, remove, canRemove, imageOptions, onPage, onReset, onSection, onAddAssets,
}: {
  entry: ReaderEntry; identity: BrandIdentity; selected: string; select: (id: string) => void;
  move: (delta: number) => void; remove: (kind: 'page'|'section') => void; canRemove: boolean;
  imageOptions: ReadonlyArray<{ label: string; value: string }>;
  onPage: (patch: BookPageOverride) => void; onReset: () => void;
  onSection: (patch: { hidden?: boolean; move?: -1|1 }) => void; onAddAssets?: AddBookAssets;
}) {
  const gt = useGT();
  const {page, section} = entry;
  const [tab, setTab] = useState<'Content'|'Elements'|'Style'>('Content');
  const reorderable = section.id !== 'intro' && section.id !== 'closing';
  const pageIndex = section.pages.findIndex(item => item.id === page.id);
  const layout = page.layout ?? {};
  const updateLayout = (patch: Partial<typeof layout>) => onPage({layout: {...layout, ...patch}});
  const palette = brandPalette(identity);
  const surface = brandSurface(palette, page.tone);
  return (
    <StudioSidebar className={styles.inspector} label={gt('Brand book page controls')} side="right" storageKey="brand-book-inspector">
      <div className={styles.inspectorHeading}><small>{section.name}</small><strong>{page.title}</strong></div>
      <div role="group" aria-label="Page settings" className={styles.inspectorTabs}>
        {(['Content','Elements','Style'] as const).map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === 'Content' && <>
        {page.kind === 'logoClearspace' && <LabInspectorSection title="Clear space diagram">
          {([
            ['clearSpaceInset','Guide distance (%)',12,-35,60],
            ['clearSpaceXSize','X marker size (%)',12,0,60],
            ['clearSpaceLogoWidth','Logo width (%)',56,1,100],
          ] as const).map(([key,label,base,min,max]) => <label className={styles.diagramField} key={key}>
            <span>{label}</span><output>{layout[key] ?? base}</output>
            <StudioRange aria-label={label} min={min} max={max} step={0.5} openMin={key === 'clearSpaceInset'} openMax
              value={layout[key] ?? base} onValueCommit={value => updateLayout({[key]:value})} onChange={event => updateLayout({[key]:Number(event.target.value)})}/>
          </label>)}
        </LabInspectorSection>}
        {page.kind === 'logoMisuse' && <LabInspectorSection title="Logo examples">
          <div className={styles.exampleControls}>{BOOK_LOGO_RULES.map((rule, index) => {
            const examples = BOOK_LOGO_RULES.map((item, i) => layout.misuse?.[i] ?? {label:item.label, shown:true});
            const example = examples[index]!;
            const edit = (patch: Partial<typeof example>) => updateLayout({misuse:examples.map((item,i) => i === index ? {...item,...patch} : item)});
            return <div key={rule.label}>
              <StudioCheckbox aria-label={'Show '+rule.label} checked={example.shown} onChange={event => edit({shown:event.target.checked})}/>
              <input aria-label={rule.label+' caption'} value={example.label} onChange={event => edit({label:event.target.value})}/>
            </div>;
          })}</div>
        </LabInspectorSection>}
        {page.kind.startsWith('colourPairings') && <LabInspectorSection title="Matrix colours">
          <div className={styles.exampleControls}>{identity.colors.map(color => <label key={color.id}>
            <StudioCheckbox aria-label={'Show '+color.name} checked={!layout.excludedColors?.includes(color.id)} onChange={event => {
              const ids = layout.excludedColors ?? [];
              updateLayout({excludedColors:event.target.checked ? ids.filter(id => id !== color.id) : [...ids,color.id]});
            }}/>{color.name}
          </label>)}</div>
        </LabInspectorSection>}
        <LabInspectorSection title="Page text">
          {Object.entries(page.copy).map(([slot, value]) => <label className="element-editor-field" key={slot}>
            <span className="capitalize">{slot}</span>
            <textarea aria-label={'Page '+slot+' copy'} className="min-h-16 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-foreground"
              maxLength={Math.max(value.length,8192)} onChange={event => onPage({copy:{[slot]:event.target.value}})} value={value}/>
          </label>)}
        </LabInspectorSection>
        <LabInspectorSection title="Page order" defaultExpanded={false}>
          <label className="element-editor-toggle"><span>Include in export</span>
            <StudioCheckbox aria-label="Show page" checked={!page.hidden} onChange={event => onPage({hidden:!event.target.checked})} variant="switch"/></label>
          <div className={styles.editorActions}>
            <button type="button" disabled={pageIndex===0} onClick={() => move(-1)}>Move earlier</button>
            <button type="button" disabled={pageIndex===section.pages.length-1} onClick={() => move(1)}>Move later</button>
            <button type="button" disabled={!canRemove} onClick={() => remove('page')}>Remove page</button>
          </div>
        </LabInspectorSection>
      </>}
      {tab === 'Elements' && <LabInspectorSection title="Place on this page">
        <LayoutInspector identity={identity} layout={layout} selected={selected} select={select} change={value => onPage({layout:value})} onAddAssets={onAddAssets}/>
        {page.image && <label className="element-editor-field">Template image
          <StudioSelect ariaLabel="Page image" value={page.assetId || 'none'}
            onValueChange={assetId => onPage({assetId:assetId === 'none' ? '' : assetId})}
            options={[{label:'Graphic device',value:'none'},...imageOptions]}/>
        </label>}
      </LabInspectorSection>}
      {tab === 'Style' && <>
        <LabInspectorSection title="Page design" action={<Button aria-label="Reset page" title="Reset page" onClick={onReset} size="icon-xs" type="button" variant="ghost"><RotateCcw aria-hidden="true"/></Button>}>
          {page.variants.length > 1 && <label className="element-editor-field">Layout
            <StudioSelect ariaLabel="Page layout" value={page.variant} onValueChange={variant => onPage({variant})}
              options={page.variants.map(variant => ({label: BOOK_VARIANT_LABELS[variant] ?? variant, value:variant}))}/>
          </label>}
          <label className="element-editor-field">Surface
            <StudioSelect ariaLabel="Page surface" value={page.tone} onValueChange={tone => onPage({tone:tone as BrandSurfaceTone})}
              options={BRAND_SURFACE_TONES.map(tone => ({label:BRAND_SURFACE_TONE_LABELS[tone],value:tone}))}/>
          </label>
          {(['background','foreground','accent'] as const).map(key => <BookColorField key={key} label={'Page '+key} identity={identity}
            fallback={key === 'accent' ? palette.accent : key === 'background' ? surface.background : surface.foreground}
            value={layout[key]} onChange={color => updateLayout({[key]:color})}/>)}
        </LabInspectorSection>
        {reorderable && <LabInspectorSection title="Section" defaultExpanded={false}>
          <label className="element-editor-toggle"><span>Include section in export</span>
            <StudioCheckbox aria-label="Show section" checked={!section.hidden} onChange={event => onSection({hidden:!event.target.checked})} variant="switch"/></label>
          <div className={styles.editorActions}>
            <button type="button" onClick={() => onSection({move:-1})}>Move earlier</button>
            <button type="button" onClick={() => onSection({move:1})}>Move later</button>
            <button type="button" onClick={() => remove('section')}>Remove section</button>
          </div>
        </LabInspectorSection>}
      </>}
    </StudioSidebar>
  );
}
