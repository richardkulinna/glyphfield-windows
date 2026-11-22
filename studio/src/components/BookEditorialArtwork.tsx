import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { BookPageContext } from './brandBookPages';
import BrandEditableText from './BrandEditableText';
import { EditorialPlate } from './BookColourPlates';
import { brandAssetPath, type BrandAsset, type BrandIdentity } from '@/lib/brandIdentity';
import { BOOK_LOGO_RULES } from '@/lib/bookLogoRules';
import { isDarkColor } from '@/lib/brandOutputKit';
import styles from './BookEditorial.module.css';

type Props = { context: BookPageContext };
function logoSource(identity: BrandIdentity, symbol: boolean, dark: boolean) {
  const preferred = symbol ? (dark ? 'mark-light' : 'mark-dark') : (dark ? 'wordmark-light' : 'wordmark');
  return brandAssetPath(identity, preferred) ?? brandAssetPath(identity, dark ? 'mark-light' : 'mark-dark');
}
function Logo({ identity, dark = false, symbol = false }: { identity: BrandIdentity; dark?: boolean; symbol?: boolean }) {
  const src = logoSource(identity, symbol, dark);
  return src ? <img src={src} alt={identity.name} /> : <strong>{identity.shortName || identity.name}</strong>;
}

export function LogoRulesPlate({ context }: Props) {
  const { identity, palette, page } = context;
  const rules = BOOK_LOGO_RULES.map((rule, index) => ({...rule, index, saved:page.layout?.misuse?.[index]}))
    .filter(rule => rule.saved?.shown !== false)
    .sort((a, b) => a.kind === b.kind ? a.index - b.index : a.kind === 'do' ? -1 : 1);
  const columns = rules.length <= 1 ? 1 : rules.length <= 4 ? 2 : rules.length <= 9 ? 3 : 4;
  return <EditorialPlate context={context} section="Logo / Anwendung">
    <div className={styles.ruleGrid} style={{gridTemplateColumns:'repeat('+columns+',minmax(0,1fr))',gridTemplateRows:'repeat('+Math.max(1, Math.ceil(rules.length / columns))+',minmax(0,1fr))'}}>
      {rules.map(rule => {
        const dark = rule.example === 'dark';
        const label = rule.saved?.label ?? rule.label;
        return <figure className={styles.ruleTile} data-example={rule.example} key={rule.example}>
          <div className={styles.ruleStage} style={{backgroundColor:dark ? palette.ink : palette.paper,color:dark ? palette.paper : palette.ink}}>
            {rule.example === 'busy' ? <div className={styles.busy}>{identity.colors.map(color => <i key={color.id} style={{backgroundColor:color.hex}} />)}</div> : null}
            <span className={styles.exampleMark}><Logo identity={identity} symbol={rule.example === 'symbol'} dark={dark} /></span>
          </div>
          <figcaption><b>{rule.kind === 'do' ? 'Do' : 'Don’t'}</b><BrandEditableText as="span" label={page.title+' '+rule.example} editable={!!context.changeLayout && context.editable} maxLength={8192} value={label}
            onCommit={value => context.changeLayout?.({...page.layout,misuse:BOOK_LOGO_RULES.map((preset,index) => ({shown:page.layout?.misuse?.[index]?.shown ?? true,label:index===rule.index ? value : page.layout?.misuse?.[index]?.label ?? preset.label}))})} /></figcaption>
        </figure>;
      })}
    </div>
  </EditorialPlate>;
}

const edges = ['top', 'right', 'bottom', 'left'] as const;
type Edge = typeof edges[number];
export function ClearSpacePlate({ context }: Props) {
  const { identity, palette, page, changeLayout, editable } = context;
  const measurement = useRef<HTMLDivElement>(null);
  const drag = useRef<{edge:Edge;id:number;start:number;initial:number;unit:number} | null>(null);
  const [aspect, setAspect] = useState(3);
  const distance = page.layout?.clearSpaceInset ?? 12;
  const size = page.layout?.clearSpaceXSize ?? 12;
  const width = page.layout?.clearSpaceLogoWidth ?? 56;
  const selected = identity.colors.find(c => c.id === page.layout?.background)?.hex;
  const background = selected ?? (page.layout?.background?.startsWith('#') ? page.layout.background : palette[page.tone]);
  const src = logoSource(identity, false, isDarkColor(background));
  const position = (e:PointerEvent, edge:Edge) => edge === 'left' || edge === 'right' ? e.clientX : e.clientY;
  function start(e:PointerEvent<HTMLSpanElement>,edge:Edge) {
    if(!editable || !changeLayout || !measurement.current || e.button!==0)return;
    const b=measurement.current.getBoundingClientRect();
    const unit=Math.min(b.width,b.height)/100;
    if(!unit)return;
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    drag.current={edge,id:e.pointerId,start:position(e,edge),initial:distance,unit};
  }
  function move(e:PointerEvent<HTMLSpanElement>) {
    const active=drag.current;
    if (!active || active.id!==e.pointerId || !changeLayout) return;
    const sign=active.edge==='top'||active.edge==='left' ? -1 : 1;
    changeLayout({...page.layout,clearSpaceInset:Math.round((active.initial + sign*(position(e,active.edge)-active.start)/active.unit)*10)/10});
  }
  return <EditorialPlate context={context} section="Logo / Konstruktion" legend={<div className={styles.diagramNotes}><strong>{page.copy.unit || 'Schutzraum'}</strong><span>{dePercent(distance)} der kurzen Logoseite</span></div>}>
    <div className={styles.gutterDiagram}>
      <div className={styles.logoMeasure} ref={measurement} style={{width:'min('+width+'cqi, '+(width * .6 * aspect)+'cqi)',aspectRatio:aspect}}>
        {src ? <img src={src} alt={identity.name} onLoad={e=>{const i=e.currentTarget;if(i.naturalHeight)setAspect(i.naturalWidth/i.naturalHeight);}} /> : <strong>{identity.shortName||identity.name}</strong>}
        <span className={styles.measureAxes} style={{'--gap':distance+'cqmin','--xSize':size+'cqmin'} as CSSProperties}>
          <span className={styles.artworkEdge} /><span className={styles.safeEdge} />
          {edges.map(edge => <span key={edge} className={styles.marker} data-edge={edge} data-draggable={editable && !!changeLayout || undefined}
            onPointerDown={e=>start(e,edge)} onPointerMove={move} onLostPointerCapture={()=>{drag.current=null;}}>x</span>)}
        </span>
      </div>
    </div>
  </EditorialPlate>;
}
function dePercent(n:number){return n.toLocaleString('de-DE')+' %';}

export function CropPlate({ context, asset }: Props & {asset?:BrandAsset}) {
  const formats = [['Querformat','16 / 9'],['Quadrat','1 / 1'],['Hochformat','4 / 5']] as const;
  return <EditorialPlate context={context} section="Bildsprache / Beschnitt">
    <div className={styles.photoComparisons}>
      {formats.map(([label,ratio])=><figure key={ratio}>
        {asset ? <img src={asset.path} alt={asset.alt ?? asset.label} style={{aspectRatio:ratio,objectPosition:asset.focalPoint?(asset.focalPoint.x*100)+'% '+(asset.focalPoint.y*100)+'%':'center'}} />
          : <div style={{aspectRatio:ratio,backgroundColor:context.palette.muted}} />}
        <figcaption>{label} · {ratio}</figcaption>
      </figure>)}
    </div>
  </EditorialPlate>;
}

export function PlacementPlate({ context }: Props) {
  const {identity,palette}=context;
  return <EditorialPlate context={context} section="Logo / Platzierung">
    <div className={styles.placements}>{[
      {label:'Oben rechts',style:{top:'10%',right:'10%'},dark:false},
      {label:'Unten rechts',style:{bottom:'10%',right:'10%'},dark:true},
      {label:'Oben rechts auf Akzent',style:{top:'10%',right:'10%'},dark:isDarkColor(palette.accent)},
    ].map((p,i)=><figure key={p.label}>
      <div className={styles.placement} style={{backgroundColor:i===2?palette.accent:p.dark?palette.ink:palette.paper,color:p.dark?palette.paper:palette.ink}}>
        <div className={styles.layoutField} /><div className={styles.miniLogo} style={p.style}><Logo identity={identity} dark={p.dark} /></div>
      </div><figcaption>{p.label}</figcaption>
    </figure>)}</div>
  </EditorialPlate>;
}

export function IconProof({context,items}:Props & {items:{pack:string;asset:BrandAsset}[]}) {
  const cols = Math.max(1,Math.ceil(Math.sqrt(items.length * 1.45)));
  return <EditorialPlate context={context} section="Symbolik / Icon-Pack">
    <div className={styles.iconGallery} style={{gridTemplateColumns:'repeat('+cols+', minmax(0,1fr))',gridTemplateRows:'repeat('+Math.max(1,Math.ceil(items.length/cols))+',minmax(0,1fr))'}}>
      {items.map(({asset,pack})=><figure key={asset.id}><img alt={asset.alt??asset.label} src={asset.path}/><figcaption>{pack} / {asset.label}</figcaption></figure>)}
    </div>
  </EditorialPlate>;
}
