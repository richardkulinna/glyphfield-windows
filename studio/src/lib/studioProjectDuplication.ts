import { duplicateBrandIdentity, type BrandIdentity } from './brandIdentity';
import { autosavedDesignStorageKey, createAutosavedDesign, savedDesignRecordKey, savedDesignStorageKey, saveProjectDesignRecords } from './savedDesigns';
import { readStudioProjectState } from './studioProjectExport';

export async function duplicateStudioProject(identity: BrandIdentity, existingNames: readonly string[]): Promise<BrandIdentity> {
  const copy = duplicateBrandIdentity(identity, undefined, existingNames);
  // Template creation may reseed generated marks. A project copy must preserve
  // the exact artwork as well as the canvases that use it.
  copy.assets = structuredClone(identity.assets);
  const { local, prefixes, records, snapshots, workspacePrefix } = await readStudioProjectState(identity.id);
  for (const [workspaceKey, snapshot] of snapshots) {
    const design = createAutosavedDesign({ ...snapshot, now: new Date().toISOString() });
    const autosaveKey = autosavedDesignStorageKey(workspaceKey);
    const key = savedDesignRecordKey(autosaveKey, design.id);
    records.set(key, { key, workspaceKey: autosaveKey, design });
  }
  const copiedRecords = [...records.values()].map(({ design, workspaceKey }) => {
    const copiedWorkspaceKey = savedDesignStorageKey(copy.id, workspaceKey.slice(workspacePrefix.length));
    return { design, workspaceKey: copiedWorkspaceKey, key: savedDesignRecordKey(copiedWorkspaceKey, design.id) };
  });
  const writtenKeys: string[] = [];
  try {
    for (const [key, value] of local) {
      const prefix = prefixes.find((candidate) => key.startsWith(candidate));
      if (!prefix) continue; // Legacy versions/recovery are now in IndexedDB.
      const copiedKey = `${prefix.replace(`:${identity.id}:`, `:${copy.id}:`)}${key.slice(prefix.length)}`;
      window.localStorage.setItem(copiedKey, value);
      writtenKeys.push(copiedKey);
    }
    await saveProjectDesignRecords(copiedRecords);
  } catch (error) {
    for (const key of writtenKeys) window.localStorage.removeItem(key);
    throw error;
  }
  return copy;
}
