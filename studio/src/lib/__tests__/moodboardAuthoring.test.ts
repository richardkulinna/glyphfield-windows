import { describe, expect, it } from 'vitest';
import { GT_BRAND_IDENTITY } from '../brandIdentity';
import { brandPalette } from '../brandOutputKit';
import { addMoodboardTile, moodboardSourceBoards, parseMoodboardOverrides, removeMoodboardTile, resolveMoodboardBoard, sanitizeMoodboardOverrides, updateMoodboardBoard, updateMoodboardTile } from '../moodboardBoard';
import { boardColors, buildMoodboardSvg, layoutMoodboard, renderMoodboardTile } from '../moodboardSvg';
import { resolveMoodboardExport } from '../moodboard';

const identity = { ...GT_BRAND_IDENTITY, colors: [
  { id: 'midnight', name: 'Midnight', hex: '#101731', role: 'Dark' },
  { id: 'ivory', name: 'Ivory', hex: '#FAF8F4', role: 'Light' },
  { id: 'berry', name: 'Berry', hex: '#B62067', role: 'Product' },
] };

describe('moodboard authoring', () => {
  it('binds the artboard and a duplicated tile to named colours throughout export and reimport', () => {
    expect(brandPalette(identity)).toMatchObject({ ink: '#101731', paper: '#FAF8F4', accent: '#B62067' });
    let edits = addMoodboardTile(identity, {}, 'showcase', 'custom-original', 'statement');
    edits = updateMoodboardBoard(identity, edits, 'showcase', { colorId: 'midnight' });
    edits = updateMoodboardTile(identity, edits, 'showcase', 'custom-original', { colorId: 'berry', copy: { headline: 'Editorial decision' } });
    const original = resolveMoodboardBoard(identity, 'showcase', edits).tiles.find((tile) => tile.id === 'custom-original')!;
    edits = addMoodboardTile(identity, edits, 'showcase', 'custom-copy', 'statement', original);
    edits = removeMoodboardTile(edits, 'showcase', 'custom-original');
    const restored = parseMoodboardOverrides(identity, moodboardSourceBoards(identity, edits), {});
    const board = resolveMoodboardBoard(identity, 'showcase', sanitizeMoodboardOverrides(identity, restored));
    expect(board.tiles.some((tile) => tile.id === 'custom-original')).toBe(false);
    const tile = board.tiles.find((entry) => entry.id === 'custom-copy')!;
    expect(tile).toMatchObject({ colorId: 'berry', copy: { headline: 'Editorial decision' } });
    const rendered = renderMoodboardTile({ identity, assets: {}, width: 300, height: 200, scope: 'sample', tile });
    expect(rendered.markup).toContain('fill="#B62067"');
    expect(boardColors(identity, board.surface, board.colorId).background).toBe('#101731');
    const svg = buildMoodboardSvg(identity, {}, 'showcase', restored);
    expect(svg).toContain('data-tile="custom-copy"');
    expect(svg).toContain('fill="#B62067"');
    expect(svg).toContain('Editorial');
    const reduced = { ...identity, colors: identity.colors.filter(({ id }) => id !== 'berry') };
    const recovered = resolveMoodboardBoard(reduced, 'showcase', sanitizeMoodboardOverrides(reduced, edits));
    expect(recovered.tiles.find(({ id }) => id === 'custom-copy')).toMatchObject({ colorId: undefined, copy: { headline: 'Editorial decision' } });
  });

  it('extends crowded boards and exports at the actual artboard ratio', () => {
    let edits = {};
    for (let i = 0; i < 14; i++) edits = addMoodboardTile(identity, edits, 'campaign', `custom-poster-${i}`, 'poster');
    const layout = layoutMoodboard(identity, 'campaign', edits);
    expect(layout.height).toBeGreaterThan(900);
    expect(layout.tiles.every(({ rect }) => rect.height > 0)).toBe(true);
    expect(resolveMoodboardExport('standard', 1600, 'campaign', layout.height / layout.width).height).toBe(layout.height);
  });
});
