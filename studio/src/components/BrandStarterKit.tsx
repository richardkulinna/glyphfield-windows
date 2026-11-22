'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { T, useGT } from 'gt-next';

import { Panel } from '@/components/BrandIdentityFields';
import { brandDeviceAsset, isDeviceArtwork } from '@/lib/brandCover';
import StudioSelect from '@/components/ui/StudioSelect';
import { fontAssetFaceCss, type BrandColor, type BrandIdentity } from '@/lib/brandIdentity';
import { brandDeviceSvg } from '@/lib/brandOutputKit';
import {
  STARTER_CORNERS,
  STARTER_DEVICES,
  STARTER_DIRECTIONS,
  STARTER_KIT_FONTS,
  STARTER_PAIRINGS,
  STARTER_PALETTES,
  starterKitPatch,
  starterKitSelection,
  starterPalette,
} from '@/lib/brandStarterKit';

import styles from './BrandIdentityStudio.module.css';

type Pattern = BrandIdentity['graphicSystem']['pattern'];
type PickerProps = { identity: BrandIdentity; update: (patch: Partial<BrandIdentity>) => void };

function kitFamily(fontId: string | undefined): string {
  return `glyphfield-kit-${fontId ?? 'none'}`;
}

/** Kit faces under their own family names, so a specimen never overrides a brand font of the same name. */
const KIT_FONT_CSS = fontAssetFaceCss(STARTER_KIT_FONTS.map((font) => ({ ...font, family: kitFamily(font.id) })));

/** The identity's graphic device drawn live; `colors` and `pattern` preview a palette or device before it is applied. */
export function LiveDevice({
  className = '',
  colors,
  height,
  identity,
  pattern,
  width,
}: {
  className?: string;
  colors?: BrandColor[];
  height: number;
  identity: BrandIdentity;
  pattern?: Pattern;
  width: number;
}) {
  const prefix = `device${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const deviceColors = colors ?? identity.colors;
  const devicePattern = pattern ?? identity.graphicSystem.pattern;
  const deviceAsset = !pattern ? brandDeviceAsset(identity) : undefined;
  const { id } = identity;
  // The device reads only the palette, the pattern and the id it is seeded from, so copy edits do not redraw it.
  const markup = useMemo(
    () => brandDeviceSvg({ ...identity, colors: deviceColors, graphicSystem: { ...identity.graphicSystem, assetId: deviceAsset?.id, pattern: devicePattern } }, { height, prefix, width }),
    [deviceColors, devicePattern, deviceAsset, height, id, prefix, width]
  );
  return <span aria-hidden='true' className={`${styles.liveDevice} ${className}`.trim()} dangerouslySetInnerHTML={{ __html: markup }} />;
}

function Option({
  children,
  description,
  name,
  onSelect,
  selected,
}: {
  children: ReactNode;
  description?: string;
  name: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <li>
      <button aria-pressed={selected} className={styles.kitOption} onClick={onSelect} type='button'>
        {children}
        <strong>{name}</strong>
        {description ? <small title={description}>{description}</small> : null}
      </button>
    </li>
  );
}

export function DirectionPicker({ identity, update }: PickerProps) {
  const gt = useGT();
  const selection = starterKitSelection(identity);
  return (
    <ul className={styles.kitOptions}>
      {STARTER_DIRECTIONS.map((direction) => (
        <Option
          description={gt(direction.description)}
          key={direction.id}
          name={gt(direction.name)}
          onSelect={() => update(starterKitPatch(identity, direction))}
          selected={selection.palette === direction.palette && selection.pairing === direction.pairing && selection.device === direction.device}
        >
          <LiveDevice className={styles.kitThumb} colors={starterPalette(direction.palette)?.colors} height={300} identity={identity} pattern={direction.device} width={480} />
        </Option>
      ))}
    </ul>
  );
}

export function PalettePicker({ identity, update }: PickerProps) {
  const gt = useGT();
  const { palette: current } = starterKitSelection(identity);
  return (
    <ul className={styles.kitOptions} data-kind='palette'>
      {STARTER_PALETTES.map((palette) => (
        <Option
          description={`${gt(palette.description)} · ${palette.darkFirst ? gt('dark first') : gt('light first')}`}
          key={palette.id}
          name={gt(palette.name)}
          onSelect={() => update(starterKitPatch(identity, { palette: palette.id }))}
          selected={current === palette.id}
        >
          <span aria-hidden='true' className={styles.kitSwatches}>
            {palette.colors.map((color) => <span key={color.id} style={{ background: color.hex }} title={`${color.name} ${color.hex}`} />)}
          </span>
        </Option>
      ))}
    </ul>
  );
}

export function PairingPicker({ identity, update }: PickerProps) {
  const gt = useGT();
  const { pairing: current } = starterKitSelection(identity);
  return (
    <>
      <style>{KIT_FONT_CSS}</style>
      <ul className={styles.kitOptions}>
        {STARTER_PAIRINGS.map((pairing) => {
          const display = pairing.typography.find(({ role }) => role === 'Display');
          const body = pairing.typography.find(({ role }) => role === 'Body');
          return (
            <Option
              description={pairing.description}
              key={pairing.id}
              name={gt(pairing.name)}
              onSelect={() => update(starterKitPatch(identity, { pairing: pairing.id }))}
              selected={current === pairing.id}
            >
              <span aria-hidden='true' className={styles.kitSpecimen}>
                <span style={{ fontFamily: `${kitFamily(display?.fontId)}, system-ui, sans-serif`, fontWeight: display?.weight }}>{identity.name}</span>
                <span style={{ fontFamily: `${kitFamily(body?.fontId)}, system-ui, sans-serif`, fontWeight: body?.weight }}><T>Body text and interface copy</T></span>
              </span>
            </Option>
          );
        })}
      </ul>
    </>
  );
}

export function DevicePicker({ identity, update }: PickerProps) {
  const gt = useGT();
  const system = identity.graphicSystem;
  const artwork = identity.assets.filter(isDeviceArtwork);
  const active = brandDeviceAsset(identity);
  const choices = artwork.map((asset) => ({ label: asset.label, value: asset.id }));
  function chooseVariant(colorId: string, assetId: string) {
    const others = (system.variants ?? []).filter((item) => item.colorId !== colorId);
    update({ graphicSystem: { ...system, variants: assetId === ':default' ? others : [...others, { assetId, colorId }] } });
  }
  const current = identity.graphicSystem.pattern;
  // A reference brand's own device (GT's globe, Ramp's ledger) is listed first while it is in use.
  const devices: readonly { name: string; pattern: Pattern }[] = STARTER_DEVICES.some(({ pattern }) => pattern === current)
    ? STARTER_DEVICES
    : [{ name: identity.graphicSystem.device || current, pattern: current }, ...STARTER_DEVICES];
  return (
    <>
    {choices.length > 0 && <div className={styles.drawingLibrary}>
      <label><T>Library drawing</T>
        <StudioSelect ariaLabel={gt('Library drawing')} onValueChange={(assetId) => update({ graphicSystem: { ...system, assetId: assetId === ':default' ? undefined : assetId } })}
          options={[{ label: gt('Use built-in drawing'), value: ':default' }, ...choices]} value={active?.id ?? ':default'} />
      </label>
      {active && <>
        <img alt={active.alt || active.label} className={styles.drawingPreview} src={active.path} />
        <details><summary><T>Colour variants</T></summary><div className={styles.variantGrid}>
          {identity.colors.map((color) => <label key={color.id}>
            <span><i aria-hidden='true' style={{ backgroundColor: color.hex }} />{color.name}</span>
            <StudioSelect ariaLabel={gt('Drawing for {name}', { name: color.name })} onValueChange={(id) => chooseVariant(color.id, id)}
              options={[{ label: gt('Use main drawing'), value: ':default' }, ...choices]} value={system.variants?.find(({ colorId }) => colorId === color.id)?.assetId ?? ':default'} />
          </label>)}
        </div></details>
      </>}
    </div>}
    <ul className={styles.kitOptions} data-kind='device'>
      {devices.map((device) => (
        <Option key={device.pattern} name={gt(device.name)} onSelect={() => update(starterKitPatch(identity, { device: device.pattern }))} selected={!active && current === device.pattern}>
          <LiveDevice className={styles.kitThumb} height={300} identity={identity} pattern={device.pattern} width={480} />
        </Option>
      ))}
    </ul>
    </>
  );
}

export function CornerPicker({ identity, update }: PickerProps) {
  const gt = useGT();
  return (
    <ul className={styles.kitOptions} data-kind='corners'>
      {STARTER_CORNERS.map((corner) => (
        <Option
          description={`${corner.value}px`}
          key={corner.value}
          name={gt(corner.label)}
          onSelect={() => update(starterKitPatch(identity, { corners: corner.value }))}
          selected={identity.style.borderRadius === corner.value}
        >
          <span aria-hidden='true' className={styles.kitCorner} style={{ borderTopLeftRadius: corner.value }} />
        </Option>
      ))}
    </ul>
  );
}

type KitPart = 'corners' | 'device' | 'directions' | 'palette' | 'type';

/** The front page's starting point for template and custom brands: whole directions, or one part at a time. */
export default function StarterKitPanel({ identity, update }: PickerProps) {
  const gt = useGT();
  const [part, setPart] = useState<KitPart>('directions');
  const parts: { id: KitPart; label: string }[] = [
    { id: 'directions', label: gt('Directions') },
    { id: 'palette', label: gt('Palette') },
    { id: 'type', label: gt('Type') },
    { id: 'device', label: gt('Device') },
    { id: 'corners', label: gt('Corners') },
  ];
  return (
    <Panel description={<T>Apply a tested direction, or change one part at a time. The name and copy stay as written.</T>} title={<T>Starter kit</T>}>
      <div aria-label={gt('Starter kit part')} className={styles.segmented} role='group'>
        {parts.map(({ id, label }) => (
          <button aria-pressed={part === id} key={id} onClick={() => setPart(id)} type='button'>{label}</button>
        ))}
      </div>
      {part === 'directions' ? <DirectionPicker identity={identity} update={update} /> : null}
      {part === 'palette' ? <PalettePicker identity={identity} update={update} /> : null}
      {part === 'type' ? <PairingPicker identity={identity} update={update} /> : null}
      {part === 'device' ? <DevicePicker identity={identity} update={update} /> : null}
      {part === 'corners' ? <CornerPicker identity={identity} update={update} /> : null}
    </Panel>
  );
}
