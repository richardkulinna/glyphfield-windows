'use client';

import { useMemo, useRef, useState } from 'react';
import type { BrandAsset, BrandIdentity } from '@/lib/brandIdentity';
import { getBrandIconPacks, type AddBrandMedia } from '@/lib/brandMedia';
import { readBrandMedia } from '@/lib/importBrandMedia';
import StudioSelect from './ui/StudioSelect';
import styles from './BookMediaPicker.module.css';

const IMAGE_TYPES = new Set<BrandAsset['type']>(['image', 'background', 'logo', 'reference', 'texture', 'product', 'proof']);
type Props = { identity: BrandIdentity; onAddAssets?: AddBrandMedia; onInsert: (asset: BrandAsset) => void };

export default function BookMediaPicker({ identity, onAddAssets, onInsert }: Props) {
  const [shelf, setShelf] = useState('images');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const photosInput = useRef<HTMLInputElement>(null);
  const iconsInput = useRef<HTMLInputElement>(null);
  const packs = useMemo(() => getBrandIconPacks(identity.assets), [identity.assets]);
  const choices = useMemo(() => {
    if (shelf === 'images') return [...identity.assets, ...identity.proofAssets].filter(item => IMAGE_TYPES.has(item.type));
    if (shelf === 'icons') return identity.assets.filter(item => item.type === 'icon');
    return packs.find(pack => shelf === 'pack:' + pack.name)?.icons ?? [];
  }, [shelf, identity.assets, identity.proofAssets, packs]);
  const search = query.trim().toLocaleLowerCase();
  const visible = search ? choices.filter(item => item.label.toLocaleLowerCase().includes(search)) : choices;

  async function upload(files: File[], pack?: string) {
    if (!onAddAssets || !files.length || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const assets = await readBrandMedia(files, pack);
      onAddAssets(identity.id, assets);
      setShelf(pack ? 'pack:' + pack.trim() : 'images');
      setQuery('');
      setMessage(pack ? 'Icon pack available. Select an icon to place it.' : 'Images available. Select one to place it.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The files could not be added to the project.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <details className={styles.picker}>
      <summary>Images and icons</summary>
      <div className={styles.content}>
        <StudioSelect ariaLabel="Media collection" value={shelf} onValueChange={next => { setShelf(next); setQuery(''); }}
          options={[
            { value: 'images', label: 'Project images' }, { value: 'icons', label: 'All icons' },
            ...packs.map(pack => ({ value: 'pack:' + pack.name, label: pack.name })),
          ]} />
        {choices.length > 0 && <input aria-label="Search media" placeholder="Find by name" type="search"
          value={query} onChange={event => setQuery(event.target.value)} />}
        {visible.length > 0 ? <div className={styles.gallery} aria-label="Place on this page">
          {visible.map(item => <button className={styles.asset} type="button" key={item.id}
            title={'Place ' + item.label} aria-label={'Place ' + item.label} onClick={() => onInsert(item)}>
            <img alt="" src={item.path} loading="lazy" decoding="async" />
            <span>{item.label}</span>
          </button>)}
        </div> : <p>{search ? 'No matching files.' : 'This collection is empty.'}</p>}
        {onAddAssets && <div className={styles.imports}>
          <button type="button" disabled={busy} onClick={() => photosInput.current?.click()}>Upload images</button>
          <input hidden ref={photosInput} aria-label="Upload image files" type="file" multiple accept="image/*"
            onChange={event => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              void upload(files);
            }} />
          <details>
            <summary>Import icon pack</summary>
            <label>Pack name<input value={name} maxLength={51} placeholder="e.g. System UIcons"
              onChange={event => setName(event.target.value)} /></label>
            <button type="button" disabled={!name.trim() || busy} onClick={() => iconsInput.current?.click()}>
              Choose SVG, PNG or ZIP files
            </button>
            <input hidden ref={iconsInput} aria-label="Upload icon pack files" type="file" multiple accept=".svg,.png,.zip"
              onChange={event => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void upload(files, name.trim());
              }} />
          </details>
        </div>}
        {(busy || message) && <p role="status">{busy ? 'Reading files…' : message}</p>}
      </div>
    </details>
  );
}
