export type BookLayer = {
  id: string;
  kind: 'text' | 'do' | 'dont' | 'image';
  text: string;
  asset: string;
  color: string;
  x: number;
  y: number;
  width: number;
  scale: number;
};

export type BookLayout = {
  background?: string;
  foreground?: string;
  accent?: string;
  hideTemplate?: boolean;
  hideFooter?: boolean;
  layers?: BookLayer[];
  excludedColors?: string[];
  misuse?: { label: string; shown: boolean }[];
  templateX?: number;
  templateY?: number;
  templateScale?: number;
};

export type BookStructure = {
  chapters?: { id: string; name: string }[];
  additions?: { id: string; group: string; template: string; title: string }[];
  removedPages?: string[];
  removedSections?: string[];
  pageOrders?: Record<string, string[]>;
};

export function orderItems<T extends { id: string }>(items: readonly T[], order: readonly string[] = []): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('Expected an object in brand book source.');
  return value as Record<string, unknown>;
}
function string(value: unknown, maximum = 8192): string {
  if (typeof value !== 'string' || value.length > maximum) throw new TypeError('Invalid brand book text.');
  return value;
}
function entries<T>(value: unknown, read: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new TypeError('Expected a list in brand book source.');
  return value.map(read);
}
function identifier(value: unknown): string {
  const id = string(value, 200);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id))
    throw new TypeError('Invalid brand book identifier.');
  return id;
}
function customId(value: unknown): string {
  const id = identifier(value);
  if (!id.startsWith('custom-')) throw new TypeError('New page or section identifiers must start with custom-.');
  return id;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new RangeError('Brand book position or scale outside its range.');
  return value;
}
export function readStructure(value: unknown): BookStructure | undefined {
  if (value === undefined) return undefined;
  const s = object(value);
  const out: BookStructure = {};
  if (s.chapters)
    out.chapters = entries(s.chapters, (v) => {
      const a = object(v);
      return { id: customId(a.id), name: string(a.name, 200) };
    });
  if (s.additions)
    out.additions = entries(s.additions, (v) => {
      const a = object(v);
      return {
        id: customId(a.id),
        group: identifier(a.group),
        template: identifier(a.template),
        title: string(a.title, 200),
      };
    });
  const ids = [...(out.chapters ?? []), ...(out.additions ?? [])].map((a) => a.id);
  if (new Set(ids).size !== ids.length) throw new RangeError('Duplicate custom page or chapter identifier.');
  if (s.removedPages) out.removedPages = entries(s.removedPages, identifier);
  if (s.removedSections)
    out.removedSections = entries(s.removedSections, identifier).filter((id) => id !== 'intro' && id !== 'closing');
  if (s.pageOrders)
    out.pageOrders = Object.fromEntries(
      Object.entries(object(s.pageOrders)).map(([key, list]) => [identifier(key), entries(list, identifier)]),
    );
  return Object.keys(out).length ? out : undefined;
}
export function readLayout(value: unknown): BookLayout | undefined {
  if (value === undefined) return undefined;
  const row = object(value);
  const out: BookLayout = {};
  for (const key of ['background', 'foreground', 'accent'] as const) if (row[key]) out[key] = string(row[key], 200);
  for (const key of ['hideTemplate', 'hideFooter'] as const) {
    if (row[key] !== undefined && typeof row[key] !== 'boolean') throw new TypeError('Expected a boolean page setting.');
    if (row[key]) out[key] = true;
  }
  for (const key of ['templateX', 'templateY'] as const)
    if (row[key] !== undefined && row[key] !== 0) out[key] = number(row[key], -100, 100);
  if (row.templateScale !== undefined && row.templateScale !== 1) out.templateScale = number(row.templateScale, 0.25, 3);
  if (row.excludedColors !== undefined) out.excludedColors = entries(row.excludedColors, (id) => string(id, 200));
  if (row.misuse !== undefined)
    out.misuse = entries(row.misuse, (value) => {
      const item = object(value);
      if (typeof item.shown !== 'boolean') throw new TypeError('Invalid example visibility.');
      return { label: string(item.label), shown: item.shown };
    });
  if (row.layers !== undefined) {
    const layers = entries(row.layers, (value) => {
      const a = object(value);
      if (!['text', 'image', 'do', 'dont'].includes(String(a.kind))) throw new RangeError('Unknown brand book element.');
      return {
        id: identifier(a.id),
        kind: a.kind as BookLayer['kind'],
        text: string(a.text),
        asset: string(a.asset, 200),
        color: string(a.color, 200),
        x: number(a.x, 0, 99),
        y: number(a.y, 0, 99),
        width: number(a.width, 2, 100),
        scale: number(a.scale, 0.25, 3),
      };
    });
    if (new Set(layers.map((a) => a.id)).size !== layers.length) throw new RangeError('Duplicate page element identifier.');
    if (layers.length) out.layers = layers;
  }
  return Object.keys(out).length ? out : undefined;
}
