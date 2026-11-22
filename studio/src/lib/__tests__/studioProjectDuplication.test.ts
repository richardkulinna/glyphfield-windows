// @vitest-environment happy-dom
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePersistentValues, schedulePersistentWrite } from '@/hooks/usePersistentState';
import { STARTER_BRAND_IDENTITY } from '../brandIdentity';
import { registerBrandProjectHost } from '../brandProjectHost';
import { captureStudioProjectExport } from '../studioProjectExport';
import { duplicateStudioProject } from '../studioProjectDuplication';
import { registerStudioProjectSnapshot } from '../studioProjectSnapshots';
import {
  activeSavedDesignStorageKey, autosaveRecoveryStorageKey, createAutosavedDesign,
  loadAutosavedDesign, loadSavedDesigns, saveAutosavedDesign, saveSavedDesign, savedDesignStorageKey,
} from '../savedDesigns';

describe('complete project duplication', () => {
  const identity = { ...STARTER_BRAND_IDENTITY, id: 'original', name: 'Project with work' };
  const workspace = savedDesignStorageKey(identity.id, 'logo-shader');
  const cleanups: (() => void)[] = [];
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    localStorage.clear();
  });
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    window.dispatchEvent(new Event('pagehide'));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('copies live unsaved work, closed tools, versions, active checkpoint and pending tool drafts independently', async () => {
    await saveAutosavedDesign(workspace, 'old canvas', '1');
    const motionWorkspace = savedDesignStorageKey(identity.id, 'animation');
    await saveAutosavedDesign(motionWorkspace, 'edited motion with audio', '9');
    const checkpoint = { ...createAutosavedDesign({ now: '2026-09-01', source: 'checkpoint canvas', revision: '2' }), id: 'checkpoint', name: 'Launch' };
    await saveSavedDesign(workspace, checkpoint);
    const activeKey = activeSavedDesignStorageKey(identity.id, 'logo-shader');
    schedulePersistentWrite(activeKey, 'checkpoint');
    const draftKey = `glyphfield-draft-v1:${identity.id}:lottie:settings`;
    schedulePersistentWrite(draftKey, { title: 'My edited Lottie', speed: 0.5 });
    localStorage.setItem('glyphfield-draft-v1:original-other:lottie:settings', 'do not copy');
    localStorage.setItem('glyphfield-theme-v1', 'dark');
    cleanups.push(registerStudioProjectSnapshot(workspace, async () => ({ source: 'current canvas with embedded assets', revision: '3' })));
    const copy = await duplicateStudioProject(identity, [identity.name]);
    expect(copy.name).toBe('Project with work copy 1');
    expect(copy.id).not.toBe(identity.id);
    expect(copy.assets).toEqual(identity.assets);
    expect(copy.assets).not.toBe(identity.assets);
    const copiedWorkspace = savedDesignStorageKey(copy.id, 'logo-shader');
    expect(await loadAutosavedDesign(copiedWorkspace)).toMatchObject({ source: 'current canvas with embedded assets', revision: '3' });
    expect(await loadAutosavedDesign(savedDesignStorageKey(copy.id, 'animation'))).toMatchObject({ source: 'edited motion with audio' });
    expect(await loadSavedDesigns(copiedWorkspace)).toEqual([checkpoint]);
    expect(localStorage.getItem(activeSavedDesignStorageKey(copy.id, 'logo-shader'))).toBe('"checkpoint"');
    expect(localStorage.getItem(`glyphfield-draft-v1:${copy.id}:lottie:settings`)).toBe('{"title":"My edited Lottie","speed":0.5}');
    expect([...capturePersistentValues([`glyphfield-draft-v1:${copy.id}:`])]).toHaveLength(1);
    await saveAutosavedDesign(copiedWorkspace, 'edit only copy', '4');
    expect(await loadAutosavedDesign(workspace)).toMatchObject({ source: 'old canvas' });
    expect(await loadSavedDesigns(workspace)).toEqual([checkpoint]);
  });

  it('embeds the live snapshot before completing, rather than falling back to an old saved canvas', async () => {
    await saveAutosavedDesign(workspace, 'old', '1');
    let resolve!: (source: { source: string; revision: string }) => void;
    cleanups.push(registerStudioProjectSnapshot(workspace, () => new Promise((done) => { resolve = done; })));
    let completed = false;
    const copying = duplicateStudioProject(identity, []).then((copy) => { completed = true; return copy; });
    await Promise.resolve();
    expect(completed).toBe(false);
    resolve({ source: 'embedded latest image', revision: '2' });
    const copy = await copying;
    expect(await loadAutosavedDesign(savedDesignStorageKey(copy.id, 'logo-shader'))).toMatchObject({ source: 'embedded latest image' });
  });

  it('includes newer recovery drafts and legacy versions from unmounted tools', async () => {
    await saveAutosavedDesign(workspace, 'old', '1', '2026-09-01');
    const recovery = createAutosavedDesign({ now: '2026-09-15', source: 'recovered', revision: '2' });
    localStorage.setItem(autosaveRecoveryStorageKey(workspace), JSON.stringify(recovery));
    const legacy = { ...recovery, id: 'legacy', name: 'Legacy version' };
    localStorage.setItem(workspace, JSON.stringify([legacy]));
    const copy = await duplicateStudioProject(identity, []);
    const target = savedDesignStorageKey(copy.id, 'logo-shader');
    expect(await loadAutosavedDesign(target)).toEqual(recovery);
    expect(await loadSavedDesigns(target)).toEqual([legacy]);
    expect(localStorage.getItem(workspace)).toBe(JSON.stringify([legacy]));
  });

  it('exports queued fields, closed workspaces, versions and live work only for this project', async () => {
    cleanups.push(registerBrandProjectHost({ identities: () => [identity, { ...identity, id: 'original:nested' }], activate: vi.fn(), duplicate: vi.fn() }));
    localStorage.setItem('glyphfield-draft-v1:original:nested:lottie:text', '"foreign nested draft"');
    await saveAutosavedDesign(savedDesignStorageKey('original:nested', 'lottie'), 'foreign nested design', '1');
    const exact = 'Line one\nLine two | `code`';
    schedulePersistentWrite('glyphfield-draft-v1:original:brand-book:book', { exact });
    localStorage.setItem('glyphfield-draft-v1:original-other:brand-book:book', '"foreign draft"');
    localStorage.setItem(activeSavedDesignStorageKey(identity.id, 'logo-shader'), '"v1"');
    await saveSavedDesign(workspace, { ...createAutosavedDesign({ now: '2026-09-01', source: '{"page":"first"}', revision: '1' }), id: 'v1' });
    await saveAutosavedDesign(savedDesignStorageKey('original-other', 'logo-shader'), 'foreign design', '99');
    cleanups.push(registerStudioProjectSnapshot(workspace, async () => ({ revision: '2', source: '{"page":"edited"}' })));
    const project = await captureStudioProjectExport(identity.id);
    expect(project.drafts['brand-book:book']).toEqual({ exact });
    expect(project.activeVersions['logo-shader']).toBe('v1');
    expect(project.designs).toHaveLength(1);
    expect(project.designs[0]).toMatchObject({ workspace: 'logo-shader', id: 'v1', source: { page: 'first' } });
    expect(project.openDocuments[0]).toEqual({ workspace: 'logo-shader', source: { page: 'edited' }, revision: '2' });
    expect(JSON.stringify(project)).not.toContain('foreign');
    expect(await captureStudioProjectExport(identity.id)).toEqual(project);
  });

  it('does not create a template copy when capturing live work fails', async () => {
    cleanups.push(registerStudioProjectSnapshot(workspace, async () => { throw new Error('Assets still loading'); }));
    await expect(duplicateStudioProject(identity, [])).rejects.toThrow('Assets still loading');
    expect(localStorage.length).toBe(0);
  });

  it('rolls back copied local drafts if IndexedDB refuses the project copy', async () => {
    await saveAutosavedDesign(workspace, 'original', '1');
    localStorage.setItem('glyphfield-draft-v1:original:lottie:value', '"keep"');
    const nativeOpen = indexedDB.open.bind(indexedDB);
    let calls = 0;
    vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
      if (++calls === 2) throw new Error('Storage full');
      return nativeOpen(...args);
    });
    await expect(duplicateStudioProject(identity, [])).rejects.toThrow('Storage full');
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('glyphfield-draft-v1:original:lottie:value')).toBe('"keep"');
  });
});
