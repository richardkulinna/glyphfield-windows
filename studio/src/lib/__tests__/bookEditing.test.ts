import { describe, expect, it } from 'vitest';

import { GT_BRAND_IDENTITY } from '../brandIdentity';
import { bookSource, parseBookSource, resolveBook, sanitizeBookOverrides, updateBookPage, visibleBookPages, type BookOverrides } from '../brandBookModel';
import type { BookLayer } from '../bookEditing';

const sectionId = 'custom-guidance';
const pageId = 'custom-marks';
const layer: BookLayer = { id: 'rule-1', kind: 'do', text: 'Use the original mark.', asset: '', color: 'ink', x: 8, y: 60, width: 50, scale: 1.25 };

describe('custom brand book editor', () => {
  it('retains sections, page order, rules, colours and geometry through storage and source', () => {
    const initial: BookOverrides = {
      structure: {
        chapters: [{ id: sectionId, name: 'Local guide' }],
        additions: [{ id: pageId, group: sectionId, template: 'logo-misuse', title: 'Working with the mark' }, { id: 'custom-note', group: sectionId, template:'foreword',title:'Closing note' }],
        pageOrders: { [sectionId]: ['custom-note',pageId] },
        removedPages: ['foreword'],
        removedSections: ['motion'],
      },
      sectionOrder: [sectionId],
    };
    const edited = updateBookPage(GT_BRAND_IDENTITY, initial, pageId, {
      layout: { background:'ink', foreground:'paper', accent:'emphasis', templateX:3, templateScale:0.82, hideFooter:true, layers:[layer], misuse:[{label:'Never change the colour.',shown:true}] },
      copy:{lead:'Approved mark examples'},
    });
    const source = bookSource(GT_BRAND_IDENTITY, edited);
    const restored = sanitizeBookOverrides(GT_BRAND_IDENTITY, JSON.parse(JSON.stringify(edited)));
    expect(bookSource(GT_BRAND_IDENTITY,restored)).toEqual(source);
    expect(bookSource(GT_BRAND_IDENTITY,parseBookSource(GT_BRAND_IDENTITY,source,undefined))).toEqual(source);
    const sections = resolveBook(GT_BRAND_IDENTITY, restored);
    expect(sections[1]?.name).toBe('Local guide');
    expect(sections[1]?.pages.map(p=>p.id)).toEqual(['custom-note',pageId]);
    expect(sections[1]?.pages[1]?.layout?.layers?.[0]).toEqual(layer);
    const ids=visibleBookPages(sections).map(p=>p.id);
    expect(ids).toContain(pageId);
    expect(ids).not.toContain('foreword');
    expect(sections.some(s=>s.id==='motion')).toBe(false);
  });

  it('retains unrelated page edits with long inherited dossier text', () => {
    const identity = { ...GT_BRAND_IDENTITY, dossier:{ ...GT_BRAND_IDENTITY.dossier, logo:'Detailed logo rule. '.repeat(1000) } };
    const edits = updateBookPage(identity,{},'foreword',{copy:{statement:'Official local edition'}});
    expect(edits.pages?.foreword?.copy?.statement).toBe('Official local edition');
    expect(parseBookSource(identity,bookSource(identity,edits),{})).toEqual(edits);
  });

  it('rejects unknown templates, duplicate page IDs and unsafe coordinates', () => {
    const settings={schema:'glyphfield.brand-book',sections:[],structure:{additions:[{id:pageId,template:'missing',group:'logo',title:'Sample'}]}};
    expect(()=>parseBookSource(GT_BRAND_IDENTITY,settings,{})).toThrow(/template/);
    const badPage = {sections:[{id:'logo',pages:[{id:'logo-misuse',layout:{layers:[{...layer,x:Infinity}]}}]}]};
    expect(()=>parseBookSource(GT_BRAND_IDENTITY,badPage,{})).toThrow(/range/);
    const duplicate={...settings,structure:{chapters:[{id:sectionId,name:'A'},{id:sectionId,name:'B'}]}};
    expect(()=>parseBookSource(GT_BRAND_IDENTITY,duplicate,{})).toThrow(/Duplicate/);
  });
});

describe('editable visual pages', () => {
  it('preserves layout and captions for removed pages across source export, import and restoration', () => {
    const page = 'logo-clearspace';
    const state = updateBookPage(GT_BRAND_IDENTITY, {}, page, {
      layout: {clearSpaceInset:-24, clearSpaceXSize:160, clearSpaceLogoWidth:140, layers:[{...layer, x:-15, width:240, scale:6}]},
      copy: {unit:'Measured from mark'},
    });
    const removed = {...state, structure:{removedPages:[page]}};
    const source = bookSource(GT_BRAND_IDENTITY, removed);
    expect(source.sections.flatMap(section => section.pages).some(item => item.id === page)).toBe(false);
    const restored = parseBookSource(GT_BRAND_IDENTITY, source, {});
    expect(restored.pages?.[page]).toEqual(state.pages?.[page]);
    const active = resolveBook(GT_BRAND_IDENTITY, { ...restored, structure:{} }).flatMap(section => section.pages);
    expect(active.find(item => item.id === page)?.layout?.layers?.[0]?.width).toBe(240);
  });
  it('pages every matrix row and column and includes every icon when libraries grow', () => {
    const base = GT_BRAND_IDENTITY;
    const identity = {...base,
      colors:Array.from({length:17},(_,i)=>({...base.colors[0]!,id:'color-'+i})),
      assets:Array.from({length:13},(_,i)=>({...base.assets[0]!,id:'icon-'+i,type:'icon' as const,tags:['icon-pack:custom']}))
    };
    const pages = resolveBook(identity, {}).flatMap(section => section.pages);
    expect(pages.filter(page => page.kind === 'colourPairings')).toHaveLength(9);
    expect(pages.find(page => page.id === 'colour-pairings-r2-c2')).toMatchObject({rowStart:16,columnStart:16});
    expect(pages.filter(page => page.kind === 'colourTints')).toHaveLength(3);
    expect(pages.filter(page => page.kind === 'deviceIcons').map(page => page.rowStart)).toEqual([0,12]);
  });
});
