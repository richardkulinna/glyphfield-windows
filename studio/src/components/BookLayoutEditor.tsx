'use client';

import { useRef, type PointerEvent } from 'react';
import type { BrandAsset, BrandIdentity } from '@/lib/brandIdentity';
import type { BookLayer, BookLayout } from '@/lib/bookEditing';
import type { BookPage } from '@/lib/brandBookModel';
import StudioSelect from './ui/StudioSelect';
import ColorControl from './ui/ColorControl';
import BookMediaPicker from './BookMediaPicker';
import styles from './BrandBook.module.css';

type Gesture = {
  id: number;
  startX: number;
  startY: number;
  origin: BookLayer;
  width: number;
  height: number;
  resize: boolean;
};
const rounded = (value: number) => Math.round(value * 100) / 100;

export function BookLayers({
  identity,
  page,
  selected,
  select,
  change,
}: {
  identity: BrandIdentity;
  page: BookPage;
  selected?: string;
  select?: (id: string) => void;
  change?: (layout: BookLayout) => void;
}) {
  const gesture = useRef<Gesture | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  function begin(e: PointerEvent<HTMLDivElement>, layer: BookLayer, resize: boolean) {
    if (!change || !overlay.current || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    select?.(layer.id);
    const bounds = overlay.current.getBoundingClientRect();
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: layer,
      width: bounds.width,
      height: bounds.height,
      resize,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveLayer(id: string, patch: Partial<BookLayer>) {
    change?.({ ...page.layout, layers: (page.layout?.layers ?? []).map(item => item.id === id ? { ...item, ...patch } : item) });
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !change || g.id !== e.pointerId) return;
    const dx = ((e.clientX - g.startX) * 100) / g.width;
    const dy = ((e.clientY - g.startY) * 100) / g.height;
    const patch = g.resize
      ? { width: Math.max(1, rounded(g.origin.width + dx)) }
      : { x: rounded(g.origin.x + dx), y: rounded(g.origin.y + dy) };
    moveLayer(g.origin.id, patch);
  }
  return (
    <div className={styles.bookLayers} ref={overlay}>
      {(page.layout?.layers ?? []).map((layer) => {
        const image = [...identity.assets, ...identity.proofAssets].find((a) => a.id === layer.asset);
        const color = identity.colors.find((c) => c.id === layer.color)?.hex ?? (/^#[\da-f]{6}$/i.test(layer.color) ? layer.color : undefined);
        return (
          <div
            className={styles.bookLayer}
            data-selected={(!!change && selected === layer.id) || undefined}
            data-editing={!!change || undefined}
            key={layer.id}
            tabIndex={change ? 0 : undefined}
            aria-label={change ? 'Move ' + (image?.label || layer.text || 'element') : undefined}
            onFocus={() => select?.(layer.id)}
            onKeyDown={event => {
              if (!change || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
              event.stopPropagation();
              event.preventDefault();
              const step = event.shiftKey ? 5 : 0.5;
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') moveLayer(layer.id, { y: layer.y + (event.key === 'ArrowUp' ? -step : step) });
              else moveLayer(layer.id, { x: layer.x + (event.key === 'ArrowLeft' ? -step : step) });
            }}
            style={{
              left: layer.x + '%',
              top: layer.y + '%',
              width: layer.width + '%',
              fontSize: 1.85 * layer.scale + 'cqi',
              color,
            }}
            onPointerDown={(e) => begin(e, layer, false)}
            onPointerMove={move}
            onPointerCancel={() => {
              gesture.current = null;
            }}
            onPointerUp={() => {
              gesture.current = null;
            }}
          >
            {layer.kind === 'image' ? (
              image && (
                <img
                  alt={image.alt ?? image.label}
                  draggable={false}
                  src={image.path}
                  style={{ width: 100 * layer.scale + '%' }}
                />
              )
            ) : (
              <>
                {layer.kind === 'do' || layer.kind === 'dont' ? (
                  <strong className={styles.ruleHeading}>{layer.kind === 'do' ? 'Do' : "Don't"}</strong>
                ) : null}
                <span>{layer.text}</span>
              </>
            )}
            {change && selected === layer.id ? (
              <div aria-hidden='true' data-pptx-ignore className={styles.layerHandle} onPointerDown={(e) => begin(e, layer, true)} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export type AddBookAssets = (projectId: string, assets: BrandAsset[]) => void;

export function BookColorField({ label, identity, value = '', fallback, onChange }: {
  label: string; identity: BrandIdentity; value?: string; fallback: string; onChange: (color: string) => void;
}) {
  const hex = identity.colors.find(item => item.id === value)?.hex ?? (/^#[\da-f]{6}$/i.test(value) ? value : fallback);
  return (
    <div className={styles.bookColorField}>
      <ColorControl ariaLabel={label} label={label} value={hex} onChange={newHex => {
        onChange(identity.colors.find(color => color.hex.toLowerCase() === newHex.toLowerCase())?.id ?? newHex);
      }} />
      {value && <button type="button" aria-label={'Reset '+label+' to automatic'} onClick={() => onChange('')}>Reset</button>}
    </div>
  );
}

export function LayoutInspector({ identity, layout, selected, select, change, onAddAssets }: {
  identity: BrandIdentity; layout: BookLayout; selected: string; select: (id: string) => void;
  change: (layout: BookLayout) => void; onAddAssets?: AddBookAssets;
}) {
  const layers = layout.layers ?? [];
  const layer = layers.find(item => item.id === selected);
  const assets = [...identity.assets, ...identity.proofAssets];
  function patchLayer(patch: Partial<BookLayer>) {
    change({ ...layout, layers: layers.map(item => item.id === selected ? { ...item, ...patch } : item) });
  }
  function add(kind: BookLayer['kind'], media?: BrandAsset) {
    const id = crypto.randomUUID();
    const next: BookLayer = { id, kind, text: media?.label ?? (kind === 'text' ? 'Text' : 'Guideline'),
      asset: media?.id ?? '', color: '', x: 8, y: 14 + (layers.length % 5) * 12, width: kind === 'image' ? 30 : 45, scale: 1 };
    change({ ...layout, layers: [...layers, next] });
    select(id);
  }
  return (
    <div className={styles.layoutInspector}>
      <BookMediaPicker identity={identity} onAddAssets={onAddAssets} onInsert={asset => add('image', asset)} />
      <div className={styles.editorActions}>
        <button type="button" onClick={() => add('text')}>Add text</button>
        <button type="button" onClick={() => add('do')}>Add do</button>
        <button type="button" onClick={() => add('dont')}>Add don’t</button>
      </div>
      {!!layers.length && <label>Page elements
        <StudioSelect ariaLabel="Select page element" value={layer?.id ?? '$none'} onValueChange={select}
          options={[{ label: 'Select an element', value: '$none' }, ...layers.map((item, i) => ({
            value: item.id, label: (i+1) + '. ' + (item.kind === 'image'
              ? [...identity.assets, ...identity.proofAssets].find(asset => asset.id === item.asset)?.label ?? 'Image'
              : item.text.slice(0, 36) || item.kind)
          }))]}/>
      </label>}
      {layer && <>
        {layer.kind === 'image' && <label>Replace image
          <StudioSelect ariaLabel="Replace element image" value={layer.asset} onValueChange={asset => patchLayer({asset})}
            options={assets.filter(item => item.type !== 'motion').map(item => ({label:item.label,value:item.id}))}/>
        </label>}
        {layer.kind !== 'image' && <>
          <label>Content<textarea aria-label="Element content" rows={3} maxLength={8192} value={layer.text} onChange={event => patchLayer({ text: event.target.value })}/></label>
          <BookColorField label="Element colour" identity={identity} value={layer.color} fallback="#181818" onChange={color => patchLayer({color})}/>
        </>}
        <div className={styles.numericFields}>
          {(['width','scale'] as const).filter(key => key === 'width' || layer.kind !== 'image').map(key => (
            <label key={key}>{ {width:'Width (%)',scale:'Text size (%)'}[key] }
              <input type="number" step="any" min={0}
                key={layer.id + key + ':' + layer[key]}
                defaultValue={key === 'scale' ? rounded(layer.scale * 100) : layer[key]}
                onDoubleClick={event => event.currentTarget.select()}
                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                onBlur={event => {
                  const input = event.currentTarget;
                  if (input.value && input.validity.valid && Number.isFinite(input.valueAsNumber)) {
                    patchLayer({ [key]: input.valueAsNumber / (key === 'scale' ? 100 : 1) });
                  } else input.value = input.defaultValue;
                }}/>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => {
          change({ ...layout, layers: layers.filter(item => item.id !== selected) });
          select('');
        }}>Remove element</button>
      </>}
    </div>
  );
}
