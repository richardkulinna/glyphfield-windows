'use client';

import { useRef, type PointerEvent } from 'react';
import type { BrandIdentity } from '@/lib/brandIdentity';
import type { BookLayer, BookLayout } from '@/lib/bookEditing';
import type { BookPage } from '@/lib/brandBookModel';
import StudioSelect from './ui/StudioSelect';
import StudioCheckbox from './ui/StudioCheckbox';
import StudioRange from './ui/StudioRange';
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
const within = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)) * 100) / 100;

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
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || !change || g.id !== e.pointerId) return;
    const dx = ((e.clientX - g.startX) * 100) / g.width;
    const dy = ((e.clientY - g.startY) * 100) / g.height;
    const patch = g.resize
      ? { width: within(g.origin.width + dx, 2, 100) }
      : { x: within(g.origin.x + dx, 0, 99), y: within(g.origin.y + dy, 0, 99) };
    change({
      ...page.layout,
      layers: (page.layout?.layers ?? []).map((l) => (l.id === g.origin.id ? { ...l, ...patch } : l)),
    });
  }
  return (
    <div className={styles.bookLayers} ref={overlay}>
      {(page.layout?.layers ?? []).map((layer) => {
        const image = identity.assets.find((a) => a.id === layer.asset);
        const color = identity.colors.find((c) => c.id === layer.color)?.hex;
        return (
          <div
            className={styles.bookLayer}
            data-selected={(!!change && selected === layer.id) || undefined}
            data-editing={!!change || undefined}
            key={layer.id}
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
              <div aria-hidden='true' className={styles.layerHandle} onPointerDown={(e) => begin(e, layer, true)} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function LayoutInspector({
  identity,
  layout,
  selected,
  select,
  change,
}: {
  identity: BrandIdentity;
  layout: BookLayout;
  selected: string;
  select: (id: string) => void;
  change: (layout: BookLayout) => void;
}) {
  const layers = layout.layers ?? [];
  const layer = layers.find((l) => l.id === selected);
  const assets = identity.assets.filter((asset) =>
    ['image', 'logo', 'product', 'background', 'icon', 'texture'].includes(asset.type),
  );
  const paletteOptions = identity.colors.map((c) => ({ label: c.name + ' (' + c.hex + ')', value: c.id }));
  function patchLayer(patch: Partial<BookLayer>) {
    change({ ...layout, layers: layers.map((l) => (l.id === selected ? { ...l, ...patch } : l)) });
  }
  function add(kind: BookLayer['kind']) {
    const id = crypto.randomUUID();
    const next: BookLayer = {
      id,
      kind,
      text: kind === 'text' ? 'Text' : 'Guideline',
      asset: kind === 'image' ? (assets[0]?.id ?? '') : '',
      color: '',
      x: 6,
      y: Math.min(75, 10 + layers.length * 12),
      width: kind === 'image' ? 26 : 45,
      scale: 1,
    };
    change({ ...layout, layers: [...layers, next] });
    select(id);
  }
  return (
    <div className={styles.layoutInspector}>
      <fieldset>
        <legend>Page palette</legend>
        {(['background', 'foreground', 'accent'] as const).map((key) => (
          <label key={key}>
            {key === 'foreground' ? 'Text' : key === 'background' ? 'Background' : 'Accent'}
            <StudioSelect
              ariaLabel={'Page ' + key}
              value={layout[key] || '$auto'}
              onValueChange={(value) => change({ ...layout, [key]: value === '$auto' ? '' : value })}
              options={[{ label: 'From brand', value: '$auto' }, ...paletteOptions]}
            />
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Template</legend>
        <label>
          <StudioCheckbox
            aria-label='Show template content'
            checked={!layout.hideTemplate}
            onChange={(e) => change({ ...layout, hideTemplate: !e.target.checked })}
          />
          Show template content
        </label>
        <label>
          <StudioCheckbox
            aria-label='Show page footer'
            checked={!layout.hideFooter}
            onChange={(e) => change({ ...layout, hideFooter: !e.target.checked })}
          />
          Show page footer when available
        </label>
        {!layout.hideTemplate &&
          (['templateX', 'templateY', 'templateScale'] as const).map((key, index) => (
            <label key={key}>
              {['Horizontal offset (%)', 'Vertical offset (%)', 'Content scale (%)'][index]}
              <StudioRange
                aria-label={key}
                min={index === 2 ? 25 : -100}
                max={index === 2 ? 300 : 100}
                value={index === 2 ? Math.round((layout.templateScale ?? 1) * 100) : (layout[key] ?? 0)}
                onChange={(e) => change({ ...layout, [key]: Number(e.target.value) / (index === 2 ? 100 : 1) })}
              />
              <output>{index === 2 ? Math.round((layout.templateScale ?? 1) * 100) : (layout[key] ?? 0)}%</output>
            </label>
          ))}
      </fieldset>
      <fieldset>
        <legend>Page elements</legend>
        <div className={styles.editorActions}>
          {(['text', 'image', 'do', 'dont'] as const).map((kind) => (
            <button type='button' disabled={kind === 'image' && !assets.length} key={kind} onClick={() => add(kind)}>
              + {{ text: 'Text', image: 'Asset', do: 'Do', dont: "Don't" }[kind]}
            </button>
          ))}
        </div>
        {layers.length > 0 && (
          <label>
            Element
            <StudioSelect
              ariaLabel='Select page element'
              value={layer?.id ?? '$none'}
              onValueChange={(id) => select(id === '$none' ? '' : id)}
              options={[
                { label: 'Select an element', value: '$none' },
                ...layers.map((l, i) => ({
                  value: l.id,
                  label:
                    i +
                    1 +
                    '. ' +
                    (l.kind === 'image'
                      ? (assets.find((a) => a.id === l.asset)?.label ?? 'Asset')
                      : l.text.slice(0, 35) || l.kind),
                })),
              ]}
            />
          </label>
        )}
        {layer && (
          <>
            {layer.kind === 'image' ? (
              <label>
                Asset
                <StudioSelect
                  ariaLabel='Element asset'
                  value={layer.asset}
                  onValueChange={(value) => patchLayer({ asset: value })}
                  options={assets.map((a) => ({ value: a.id, label: a.label }))}
                />
              </label>
            ) : (
              <>
                <label>
                  Content
                  <textarea
                    aria-label='Element content'
                    rows={3}
                    maxLength={8192}
                    value={layer.text}
                    onChange={(e) => patchLayer({ text: e.target.value })}
                  />
                </label>
                <label>
                  Colour
                  <StudioSelect
                    ariaLabel='Element colour'
                    value={layer.color || '$auto'}
                    onValueChange={(value) => patchLayer({ color: value === '$auto' ? '' : value })}
                    options={[{ value: '$auto', label: 'Page text' }, ...paletteOptions]}
                  />
                </label>
              </>
            )}
            <div className={styles.numericFields}>
              {(['x', 'y', 'width', 'scale'] as const).map((key) => (
                <label key={key}>
                  {{ x: 'X (%)', y: 'Y (%)', width: 'Width (%)', scale: 'Scale (%)' }[key]}
                  <input
                    type='number'
                    step='1'
                    min={key === 'scale' ? 25 : key === 'width' ? 2 : 0}
                    max={key === 'scale' ? 300 : key === 'width' ? 100 : 99}
                    value={key === 'scale' ? Math.round(layer.scale * 100) : layer[key]}
                    onChange={(e) => {
                      if (e.target.value && e.target.validity.valid)
                        patchLayer({ [key]: Number(e.target.value) / (key === 'scale' ? 100 : 1) });
                    }}
                  />
                </label>
              ))}
            </div>
            <button
              type='button'
              onClick={() => {
                change({ ...layout, layers: layers.filter((l) => l.id !== selected) });
                select('');
              }}
            >
              Remove element
            </button>
          </>
        )}
      </fieldset>
    </div>
  );
}
