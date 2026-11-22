import { Fragment, type CSSProperties, type ReactNode } from 'react';
import BrandEditableText from './BrandEditableText';
import type { BookPageContext } from './brandBookPages';
import { brandTypographyFamily } from '@/lib/brandIdentity';
import { colorContrastRatio, mixHexColors } from '@/lib/color';
import styles from './BookEditorial.module.css';

type PlateProps = { context: BookPageContext };
const percentages = [0, 20, 40, 60, 80] as const;
const deutsch = new Intl.NumberFormat('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2});

export function EditorialPlate({ context, section, children, note, legend }: PlateProps & {
  section: string; children: ReactNode; note?: ReactNode; legend?: ReactNode;
}) {
  const { page, identity, editable, onCopy } = context;
  function field(slot: string, fallback: string, tag: 'h1' | 'p') {
    const value = page.copy[slot] ?? fallback;
    return <BrandEditableText as={tag} editable={editable && Object.hasOwn(page.copy, slot)} label={page.title + ' ' + slot}
      maxLength={Math.max(value.length, 8192)} multiline={tag === 'p'} onCommit={text => onCopy(page.id, slot, text)} value={value} />;
  }
  return <div className={styles.plate}>
    <header className={styles.plateHead}>
      <div className={styles.running}><strong>{identity.name}</strong><span>{section}</span></div>
      {field('title', page.title, 'h1')}
      {page.copy.lead ? field('lead', '', 'p') : null}
    </header>
    <div className={styles.plateBody}>{children}</div>
    {legend || note ? <div className={styles.plateFoot}>{legend}{note ? <p>{note}</p> : null}</div> : null}
  </div>;
}

/** Encode the same WCAG relative luminance as an achromatic sRGB swatch. */
function grayEquivalent(hex: string) {
  const luminance = (colorContrastRatio(hex, '#000000') - 1) * 0.05;
  const srgb = luminance <= 0.0031308 ? 12.92 * luminance : 1.055 * luminance ** (1 / 2.4) - 0.055;
  const channel = Math.round(srgb * 255).toString(16).padStart(2, '0');
  return '#' + channel.repeat(3);
}

function pageColours(context: BookPageContext) {
  return context.identity.colors.filter(color => !context.page.layout?.excludedColors?.includes(color.id));
}
function paletteWindow(context: BookPageContext, start = 0) {
  const excluded = context.page.layout?.excludedColors ?? [];
  return context.identity.colors.slice(start, start + 8).filter(color => !excluded.includes(color.id));
}

export function PairingsPlate({ context }: PlateProps) {
  const backgrounds = paletteWindow(context, context.page.rowStart);
  const inks = paletteWindow(context, context.page.columnStart);
  const filtered = context.page.kind === 'colourPairingsFiltered';
  const monochrome = context.page.kind === 'colourPairingsGray';
  const show = (hex: string) => monochrome ? grayEquivalent(hex) : hex;
  const legend = <div className={styles.legend}>
    <div><strong>{filtered ? 'Gerahmt ab 4,5 : 1' : 'Text ab 4,5 : 1'}</strong><span>Für Fließtext. Ab 7 : 1 besonders stark (AAA).</span></div>
    <div><strong>Groß von 3 bis unter 4,5 : 1</strong><span>Ab 18 pt oder ab 14 pt fett.</span></div>
    <div><strong>{filtered ? 'Leer unter 3 : 1' : 'Schwach unter 3 : 1'}</strong><span>Zu wenig Kontrast für Text.</span></div>
  </div>;
  return <EditorialPlate context={context} section="Markenfarben / sRGB" legend={legend}
    note={monochrome ? 'Graustufen zeigen die relative Helligkeit. Die Bewertung verwendet die ungerundeten Kontraste der Originalfarben.' : 'WCAG 2.2 für digitale Texte. Die Einstufung verwendet ungerundete Kontrastwerte.'}>
    {backgrounds.length && inks.length ? <table className={styles.matrix} style={{'--density': Math.max(1, backgrounds.length / 6, inks.length / 6)} as CSSProperties}>
      <caption className={styles.srOnly}>{context.page.title}</caption>
      <colgroup><col className={styles.stubColumn} />{inks.map(ink => <col key={ink.id} />)}</colgroup>
      <thead>
        <tr><td /><th scope="colgroup" colSpan={inks.length} className={styles.axis}>Schriftfarbe</th></tr>
        <tr><th scope="col">Hintergrund</th>{inks.map(ink => <th scope="col" key={ink.id}><span>{ink.name}</span><i className={styles.colorKey} style={{backgroundColor: show(ink.hex)}} /></th>)}</tr>
      </thead>
      <tbody>{backgrounds.map(bg => <tr key={bg.id}>
        <th scope="row"><strong>{bg.name}</strong><small>{bg.hex.toUpperCase()}</small></th>
        {inks.map(ink => {
          const ratio = colorContrastRatio(bg.hex, ink.hex);
          if (filtered && ratio < 3) return <td key={ink.id} aria-label={bg.name + ' / ' + ink.name + ' unter 3 : 1'} />;
          const rating = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'Text' : ratio >= 3 ? 'Nur groß' : 'Schwach';
          const keyline = colorContrastRatio(bg.hex, context.palette.ink) > colorContrastRatio(bg.hex, context.palette.paper) ? context.palette.ink : context.palette.paper;
          return <td key={ink.id}>
            <div className={styles.pair} data-framed={filtered && ratio >= 4.5 || undefined} style={{backgroundColor: show(bg.hex), color: show(ink.hex), '--keyline':show(keyline)} as CSSProperties}>Aa</div>
            <div className={styles.readout}><b>{deutsch.format(ratio)} : 1</b><span>{rating}</span></div>
          </td>;
        })}
      </tr>)}</tbody>
    </table> : <p>Wähle mindestens eine Markenfarbe.</p>}
  </EditorialPlate>;
}

export function TonePlate({ context }: PlateProps) {
  const colors = paletteWindow(context, context.page.rowStart);
  const dark = context.page.kind === 'colourShades';
  const base = dark ? '#000000' : '#FFFFFF';
  return <EditorialPlate context={context} section="Markenfarben / sRGB"
    note="Mischung je sRGB-Kanal. Jeder HEX-Wert beschreibt eine deckende Vollfarbe.">
    <table className={styles.tones} style={{'--density':Math.max(1, colors.length / 6)} as CSSProperties}>
      <caption className={styles.srOnly}>{context.page.title}</caption>
      <colgroup><col className={styles.stubColumn} />{percentages.map(p => <col key={p} />)}</colgroup>
      <thead><tr><th scope="col">Markenfarbe</th>{percentages.map(p => <th scope="col" key={p}>{p ? p + ' % ' + (dark ? 'Schwarz' : 'Weiß') : 'Original'}</th>)}</tr></thead>
      <tbody>{colors.map(color => <tr key={color.id}>
        <th scope="row" title={color.role}><strong>{color.name}</strong><small>{color.role.length <= 36 ? color.role : color.hex.toUpperCase()}</small></th>
        {percentages.map(p => {
          const hex = mixHexColors(color.hex, base, p / 100);
          return <td key={p}><div className={styles.toneSwatch} style={{backgroundColor:hex}} /><b>{hex}</b></td>;
        })}
      </tr>)}</tbody>
    </table>
  </EditorialPlate>;
}

export function ColourRolesPlate({ context }: PlateProps) {
  const colors = pageColours(context);
  return <EditorialPlate context={context} section="Markenfarben / Einsatz">
    <div className={styles.roleGrid} style={{gridTemplateRows:'repeat('+Math.max(1,Math.ceil(colors.length / 2))+', minmax(0,1fr))'}}>
      {colors.map(color => <div key={color.id} className={styles.roleItem}>
        <span style={{backgroundColor:color.hex}} /><div><strong>{color.name}</strong><p>{color.role}</p><small>{color.hex.toUpperCase()}</small></div>
      </div>)}
    </div>
  </EditorialPlate>;
}

export function GlyphsPlate({ context }: PlateProps) {
  const { identity, page } = context;
  const fonts = identity.typography.filter(f => f.role !== 'Code');
  const sample = page.copy.sample || 'H&S';
  return <EditorialPlate context={context} section="Typografie / Zeichen">
    <div className={styles.glyphs}>{fonts.map(font => <Fragment key={font.role}>
      <div><strong>{font.family}</strong><small>{font.role} / {font.weight ?? 400}</small></div>
      <span style={{fontFamily:brandTypographyFamily(identity,font.role),fontWeight:font.weight}}>{sample}</span>
      <p style={{fontFamily:brandTypographyFamily(identity,font.role),fontWeight:font.weight}}>Ä Ö Ü ß &amp; 0123456789</p>
    </Fragment>)}</div>
  </EditorialPlate>;
}
