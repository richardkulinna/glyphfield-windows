import { waitForProjectAutosaveWrites } from '@/hooks/useCanvasDocumentAutosave';
import { capturePersistentValues } from '@/hooks/usePersistentState';
import { autosavedDesignStorageKey, autosaveRecoveryStorageKey, loadProjectDesignRecords, savedDesignRecordKey, savedDesignStorageKey, type SavedDesign, type SavedDesignRecord } from './savedDesigns';
import { brandProjectHost } from './brandProjectHost';
import { captureStudioProjectSnapshots } from './studioProjectSnapshots';

function mergeRecord(records: Map<string, SavedDesignRecord>, workspaceKey: string, design: SavedDesign) {
  if (!design || typeof design.id !== 'string' || typeof design.source !== 'string') {
    throw new Error('A saved design could not be read. The original project has not been changed.');
  }
  const key = savedDesignRecordKey(workspaceKey, design.id);
  const stored = records.get(key);
  if (!stored || design.updatedAt > stored.design.updatedAt) records.set(key, { key, workspaceKey, design });
}

export async function readStudioProjectState(identityId: string) {
  const workspacePrefix = savedDesignStorageKey(identityId, '');
  const recoveryPrefix = autosaveRecoveryStorageKey(workspacePrefix);
  const prefixes = [`glyphfield-draft-v1:${identityId}:`, `glyphfield-active-saved-design-v1:${identityId}:`];
  // Capture at invocation, before asynchronous asset embedding/autosave completes.
  const allPrefixes = [...prefixes, workspacePrefix, recoveryPrefix];
  // Older source files may contain project ids with colons, also used as key separators.
  const nestedIds = brandProjectHost()?.identities().map(({ id }) => id).filter((id) => id.startsWith(identityId + ':')) ?? [];
  const foreignPrefixes = nestedIds.flatMap((id) => allPrefixes.map((prefix) => prefix.replace(':' + identityId + ':', ':' + id + ':')));
  const belongs = (key: string) => !foreignPrefixes.some((prefix) => key.startsWith(prefix));
  const local = new Map([...capturePersistentValues(allPrefixes)].filter(([key]) => belongs(key)));
  const snapshots = await captureStudioProjectSnapshots(identityId, belongs);
  await waitForProjectAutosaveWrites(identityId);
  const records = new Map((await loadProjectDesignRecords(identityId)).filter((record) => belongs(record.workspaceKey)).map((record) => [record.key, record]));
  for (const [key, value] of local) {
    if (key.startsWith(workspacePrefix)) {
      const legacy: unknown = JSON.parse(value);
      if (!Array.isArray(legacy)) throw new Error('A saved project version could not be read.');
      for (const design of legacy) mergeRecord(records, key, design);
    } else if (key.startsWith(recoveryPrefix)) {
      mergeRecord(records, autosavedDesignStorageKey(key.slice('glyphfield-autosave-recovery-v1:'.length)), JSON.parse(value));
    }
  }
  return { local, prefixes, records, snapshots, workspacePrefix };
}

function parseDocument(source: string): unknown {
  try { return JSON.parse(source) as unknown; }
  catch { return source; }
}

/** Captures only this project's authorship data. The kit encoder handles portable file references. */
export async function captureStudioProjectExport(identityId: string) {
  const { local, prefixes, records, snapshots, workspacePrefix } = await readStudioProjectState(identityId);
  function entries(prefix: string) {
    return Object.fromEntries([...local].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key.slice(prefix.length), parseDocument(value)]));
  }
  return {
    schemaVersion: 1,
    identityId,
    drafts: entries(prefixes[0]!),
    activeVersions: entries(prefixes[1]!),
    designs: [...records.values()].sort((a, b) => a.key.localeCompare(b.key)).map(({ workspaceKey, design }) => ({
      ...design, workspace: workspaceKey.slice(workspacePrefix.length), source: parseDocument(design.source),
    })),
    openDocuments: [...snapshots].sort(([a], [b]) => a.localeCompare(b)).map(([key, snapshot]) => ({
      workspace: key.slice(workspacePrefix.length), revision: snapshot.revision, source: parseDocument(snapshot.source),
    })),
  };
}
