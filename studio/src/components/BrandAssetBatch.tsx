'use client';

import { useState } from 'react';
import { T, useGT } from 'gt-next';
import type { BrandAsset } from '@/lib/brandIdentity';
import { Field, INPUT_CLASS } from './BrandIdentityFields';
import { Button } from './ui/Button';
import StudioSelect from './ui/StudioSelect';
import styles from './BrandIdentityStudio.module.css';

type BatchField = 'usage' | 'tags' | 'redistribution' | 'license' | 'sourceOwner';

export default function BrandAssetBatch({ count, onApply, onCancel, onRemove }: {
  count: number;
  onApply: (edit: (asset: BrandAsset) => BrandAsset) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const gt = useGT();
  const [field, setField] = useState<BatchField>('usage');
  const [value, setValue] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  function changeField(next: string) {
    setField(next as BatchField);
    setValue(next === 'redistribution' ? 'original' : '');
  }
  function apply() {
    if (field === 'tags') {
      const added = value.split(',').map((tag) => tag.trim()).filter(Boolean);
      onApply((asset) => ({ ...asset, tags: [...new Set([...(asset.tags ?? []), ...added])] }));
    } else {
      onApply((asset) => ({ ...asset, [field]: value.trim() }));
    }
    onCancel();
  }
  return (
    <fieldset className={styles.batchEditor}>
      <legend>{gt('{count} selected', { count })}</legend>
      <Field label={<T>Change field</T>}>
        <StudioSelect ariaLabel={gt('Change field')} onValueChange={changeField} options={[
          { label: gt('Usage'), value: 'usage' }, { label: gt('Add tags'), value: 'tags' },
          { label: gt('Source owner'), value: 'sourceOwner' }, { label: gt('License'), value: 'license' },
          { label: gt('Redistribution'), value: 'redistribution' },
        ]} value={field} />
      </Field>
      <Field label={field === 'tags' ? <T>Tags, comma separated</T> : <T>New value</T>}>
        {field === 'redistribution'
          ? <StudioSelect ariaLabel={gt('New redistribution status')} onValueChange={setValue} options={[
            { label: gt('Original'), value: 'original' }, { label: gt('Bundled'), value: 'bundled' },
            { label: gt('Research only'), value: 'research-only' }, { label: gt('URL only'), value: 'url-only' },
          ]} value={value} />
          : <input className={INPUT_CLASS} onChange={(event) => setValue(event.target.value)} value={value} />}
      </Field>
      <div className={styles.batchActions}>
        <Button disabled={!value.trim()} onClick={apply} size='sm' type='button'><T>Apply to selection</T></Button>
        <Button onClick={onCancel} size='sm' type='button' variant='outline'><T>Clear selection</T></Button>
        <Button onClick={() => confirmRemove ? onRemove() : setConfirmRemove(true)} size='sm' type='button' variant='ghost'>
          {confirmRemove ? gt('Confirm removal of {count} files', { count }) : gt('Remove selected')}
        </Button>
      </div>
    </fieldset>
  );
}
