import { makeCurrentTree } from '../../test-utils/core-loop';
import {
  makeCosmetic,
  makeEquipment,
  makeSpeciesList,
  OAK,
  SIGNATURE,
  STONE_LANTERN,
  TWIG_FRAME,
} from '../../test-utils/rewards';
import type { ApiClient } from '../client';
import {
  cosmeticsSchema,
  equipCosmetic,
  equipmentSchema,
  getCosmetics,
  getEquipment,
  getSpecies,
  selectSpecies,
  speciesListSchema,
  unequipSlot,
} from '../progression';

function recordingClient(answer: unknown = {}) {
  const calls: { path: string; options: Record<string, unknown> }[] = [];
  const client = {
    request: jest.fn(async (path: string, options: Record<string, unknown> = {}) => {
      calls.push({ path, options });
      return (options.schema as { parse: (v: unknown) => unknown }).parse(answer);
    }),
  } as unknown as ApiClient;
  return { client, calls };
}

describe('species, cosmetics, and equipment contracts (A4.3)', () => {
  it('reads owned species, whether each can be chosen, and the month’s choice', () => {
    const list = makeSpeciesList([SIGNATURE, OAK], { speciesId: 'oak', locked: false });
    const parsed = speciesListSchema.parse(list);
    expect(parsed.items.map((s) => [s.id, s.selectable])).toEqual([
      ['signature', true],
      ['oak', true],
    ]);
    expect(parsed.current).toEqual({ year: 2026, month: 10, speciesId: 'oak', locked: false });
    // A species id this version cannot draw is still read (drawn as the signature species).
    const later = makeSpeciesList([{ ...OAK, id: 'moon-tree', name: 'Moon Tree' }]);
    expect(speciesListSchema.safeParse(later).success).toBe(true);
  });

  it('reads owned cosmetics, with a type this version does not know', () => {
    const items = [
      { ...STONE_LANTERN, equipped: true },
      { ...makeCosmetic({ id: 'aurora', type: 'sky' }), equipped: false },
    ];
    expect(cosmeticsSchema.parse({ items }).items.map((c) => c.type)).toEqual([
      'decoration',
      'sky',
    ]);
  });

  it('reads the garden’s slots and the profile frame', () => {
    const equipment = makeEquipment({ decoration: STONE_LANTERN }, TWIG_FRAME);
    const parsed = equipmentSchema.parse(equipment);
    expect(parsed.forest.decoration?.id).toBe('stone-lantern');
    expect(parsed.forest.background).toBeNull();
    expect(parsed.profileFrame?.id).toBe('twig-frame');
  });

  it('reads and writes at the A4.3 routes', async () => {
    const species = recordingClient(makeSpeciesList());
    await getSpecies(species.client);
    expect(species.calls[0]?.path).toBe('/me/species');

    const tree = recordingClient(makeCurrentTree());
    await selectSpecies(tree.client, 'oak');
    expect(tree.calls[0]).toMatchObject({
      path: '/me/trees/current/species',
      options: { method: 'PUT', body: { speciesId: 'oak' } },
    });

    const cosmetics = recordingClient({ items: [] });
    await getCosmetics(cosmetics.client);
    expect(cosmetics.calls[0]?.path).toBe('/me/cosmetics');

    const equipment = recordingClient(makeEquipment());
    await getEquipment(equipment.client);
    await equipCosmetic(equipment.client, 'decoration', 'stone-lantern');
    await unequipSlot(equipment.client, 'profile_frame');
    expect(equipment.calls.map((c) => [c.path, c.options.method ?? 'GET', c.options.body])).toEqual(
      [
        ['/me/equipment', 'GET', undefined],
        ['/me/equipment/decoration', 'PUT', { cosmeticId: 'stone-lantern' }],
        ['/me/equipment/profile_frame', 'DELETE', undefined],
      ],
    );
  });
});
