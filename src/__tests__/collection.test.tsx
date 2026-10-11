import { act, fireEvent, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';

import { NetworkError, type HomeResponse } from '../api';
import type { CollectionItem } from '../api/collection';
import type { Cosmetic, Equipment } from '../api/progression';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import {
  FIRST_SESSION_ITEM,
  GOLDEN_SAKURA_ITEM,
  makeCollection,
  MEADOW_ITEM,
  MISTY_HILLS_ITEM,
  MOSSY_STONES_ITEM,
  OAK_ITEM,
  SEVEN_DAYS_ITEM,
  SIGNATURE_ITEM,
  STONE_LANTERN_ITEM,
  TWIG_FRAME_ITEM,
} from '../test-utils/collection';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { forestMonths, forestPage } from '../test-utils/forest';
import { makeLifetime } from '../test-utils/insights';
import { makePreferences } from '../test-utils/preferences';
import { FIRST_SESSION, makeBadges } from '../test-utils/progression';
import { renderApp } from '../test-utils/render-app';
import {
  makeCosmetic,
  makeEquipment,
  makeSpeciesList,
  OAK,
  SIGNATURE,
  STONE_LANTERN,
  TWIG_FRAME,
} from '../test-utils/rewards';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { until } from '../test-utils/sheets';
import { treeDto } from '../test-utils/trees';
import { TreeScene } from '../tree/TreeScene';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
type Reply = { status: number; body?: unknown } | Error;
const hidden = { includeHiddenElements: true } as const;

const COSMETICS: Record<string, Cosmetic> = {
  meadow: makeCosmetic(),
  'mossy-stones': makeCosmetic({
    id: 'mossy-stones',
    name: 'Mossy Stones',
    description: 'A few quiet stones on the ground.',
    type: 'decoration',
    artworkId: 'mossy-stones',
  }),
  'stone-lantern': STONE_LANTERN,
  'twig-frame': TWIG_FRAME,
};

/**
 * A4.3 and A4.4 as these tests script them: the derived Collection Book, and equipment that a
 * PUT or DELETE changes and answers (or `equipAnswer`, possibly held). The collection's
 * `equipped` follows the stored equipment, as the server derives it.
 */
function collectionApi() {
  const state = {
    offline: false,
    collectionDown: false,
    forest: forestMonths(5),
    forestDown: false,
    equipment: makeEquipment() as Equipment,
    equipAnswer: null as Reply | null,
    held: [] as (() => void)[],
    hold: false,
    /** GET /me/equipment never answers: what is drawn is what the app already holds. */
    equipmentSilent: false,
    speciesId: 'signature',
    showcase: [] as string[],
    extraBadges: [] as CollectionItem[],
  };
  const slotOf = (slot: string) =>
    slot === 'profile_frame' ? 'profileFrame' : (slot as keyof Equipment['forest']);
  const equippedIds = () =>
    new Set(
      [...Object.values(state.equipment.forest), state.equipment.profileFrame]
        .filter((c): c is Cosmetic => c !== null)
        .map((c) => c.id),
    );
  const collection = () =>
    makeCollection({
      species: [SIGNATURE_ITEM, OAK_ITEM, GOLDEN_SAKURA_ITEM].map(
        (item) => ({ ...item, selected: item.id === state.speciesId }) as CollectionItem,
      ),
      badges: [FIRST_SESSION_ITEM, SEVEN_DAYS_ITEM, ...state.extraBadges].map(
        (item) =>
          ({
            ...item,
            showcasePosition: state.showcase.includes(item.id)
              ? state.showcase.indexOf(item.id)
              : null,
          }) as CollectionItem,
      ),
      cosmetics: [
        MEADOW_ITEM,
        MOSSY_STONES_ITEM,
        STONE_LANTERN_ITEM,
        MISTY_HILLS_ITEM,
        TWIG_FRAME_ITEM,
      ].map((item) => ({ ...item, equipped: equippedIds().has(item.id) }) as CollectionItem),
    });
  const store = (slot: string, cosmetic: Cosmetic | null) => {
    const key = slotOf(slot);
    state.equipment =
      key === 'profileFrame'
        ? { ...state.equipment, profileFrame: cosmetic }
        : { ...state.equipment, forest: { ...state.equipment.forest, [key]: cosmetic } };
  };
  const handler = ({ url, method, body }: FakeRequest): Reply | Promise<Reply> => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home') {
      const home: HomeResponse = { ...makeHome(), tree: treeDto({ stage: 'sprout' }) };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current' && method === 'GET')
      return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/collection') {
      if (state.collectionDown) return { status: 500, body: nestError(500, 'Down.') };
      return { status: 200, body: collection() };
    }
    if (pathname === '/me/forest') {
      if (state.forestDown) return { status: 500, body: nestError(500, 'Down.') };
      return { status: 200, body: forestPage(state.forest) };
    }
    if (pathname === '/me/species')
      return {
        status: 200,
        body: makeSpeciesList([SIGNATURE, OAK], { speciesId: state.speciesId, locked: false }),
      };
    if (pathname === '/me/trees/current/species' && method === 'PUT') {
      state.speciesId = (body as { speciesId: string }).speciesId;
      return { status: 200, body: makeCurrentTree() };
    }
    if (pathname === '/me/equipment' && method === 'GET') {
      if (state.equipmentSilent) return new Promise<Reply>(() => undefined);
      return { status: 200, body: state.equipment };
    }
    const equip = /^\/me\/equipment\/([a-z_]+)$/.exec(pathname);
    if (equip && (method === 'PUT' || method === 'DELETE')) {
      const answer = (): Reply => {
        if (state.equipAnswer) {
          const reply = state.equipAnswer;
          state.equipAnswer = null;
          return reply;
        }
        const id = method === 'PUT' ? (body as { cosmeticId: string }).cosmeticId : null;
        store(equip[1]!, id ? COSMETICS[id]! : null);
        return { status: 200, body: state.equipment };
      };
      if (state.hold)
        return new Promise<Reply>((resolve) => state.held.push(() => resolve(answer())));
      return answer();
    }
    if (pathname === '/me/profile')
      return {
        status: 200,
        body: {
          id: 'user-1',
          username: null,
          displayName: 'Mai Anh',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-09-26T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    if (pathname === '/me/profile/stats') return { status: 200, body: makeLifetime() };
    const badges = () =>
      makeBadges(
        [FIRST_SESSION],
        state.showcase.map(() => FIRST_SESSION),
      );
    if (pathname === '/me/badges') return { status: 200, body: badges() };
    if (pathname === '/me/achievements') return { status: 200, body: { items: [] } };
    if (pathname === '/me/badges/showcase' && method === 'PUT') {
      state.showcase = (body as { badgeIds: string[] }).badgeIds;
      return { status: 200, body: badges() };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof collectionApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = collectionApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const collectionReads = () => requests.filter((r) => r.url === `${API}/me/collection`).length;
const equipCalls = () =>
  requests
    .filter((r) => r.url.startsWith(`${API}/me/equipment/`))
    .map((r) => [r.method, r.url.slice(`${API}/me/equipment/`.length), r.body]);

async function openCollection() {
  renderApp(appRoutes, { initialUrl: '/collection' });
  await screen.findByRole('header', { name: 'Collection Book' });
  await shows('2 of 3 in your collection');
}

async function openItem(kind: string, id: string, name: string) {
  renderApp(appRoutes, { initialUrl: `/collection/${kind}/${id}` });
  await screen.findByRole('header', { name });
}

describe('the Collection Book: a calm record of what was earned (docs/05, docs/02)', () => {
  it('opens from the Forest', async () => {
    renderApp(appRoutes, { initialUrl: '/forest' });
    fireEvent.press(await screen.findByRole('button', { name: /Collection Book/ }));
    await screen.findByRole('header', { name: 'Collection Book' });
  });

  it('stays reachable when the forest cannot load', async () => {
    server.state.forestDown = true;
    renderApp(appRoutes, { initialUrl: '/forest' });
    await shows("We couldn't load your forest right now.");
    fireEvent.press(screen.getByRole('button', { name: /Collection Book/ }));
    await screen.findByRole('header', { name: 'Collection Book' });
  });

  it('shows the sections with counts, owned items in their art and locked ones as silhouettes', async () => {
    await openCollection();
    for (const title of ['Trees', 'Badges', 'Garden and profile']) {
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    }
    expect(screen.getByText('1 of 2 in your collection')).toBeOnTheScreen();
    expect(screen.getByText('4 of 5 in your collection')).toBeOnTheScreen();
    expect(screen.queryByText(/%/)).toBeNull();

    expect(screen.getByRole('button', { name: 'Oak' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Golden Sakura, not yet in your collection' }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('collection-silhouette-golden-sakura', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('collection-silhouette-streak-7', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('collection-silhouette-misty-hills', hidden)).toBeOnTheScreen();
    // Owned: the species drawn by the renderer, the badge's mark, the cosmetic's mark.
    const species = screen.UNSAFE_getAllByType(TreeScene).map((s) => s.props.tree.speciesId);
    expect(species).toEqual(expect.arrayContaining(['signature', 'oak']));
    expect(species).not.toContain('golden-sakura');
    expect(screen.getByTestId('badge-mark-first-session', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('cosmetic-mark-stone-lantern', hidden)).toBeOnTheScreen();
    expect(screen.queryByTestId('cosmetic-mark-misty-hills', hidden)).toBeNull();
  });

  it('says calmly when the collection cannot load, and tries again', async () => {
    server.state.collectionDown = true;
    renderApp(appRoutes, { initialUrl: '/collection' });
    await shows("We couldn't load your collection right now.");
    server.state.collectionDown = false;
    fireEvent.press(screen.getByRole('button', { name: /Try again/ }));
    await shows('2 of 3 in your collection');
  });

  it('opens a locked item with the server’s honest hint and its progress, nothing to use', async () => {
    await openCollection();
    fireEvent.press(
      screen.getByRole('button', { name: 'Golden Sakura, not yet in your collection' }),
    );
    await screen.findByRole('header', { name: 'Golden Sakura' });
    expect(screen.getByText('A rare sakura with golden blossoms.')).toBeOnTheScreen();
    expect(
      screen.getByText('Comes with the 500 Hours badge: Focus for 500 hours in total.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('32.5 / 500 h')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Use|Choose/ })).toBeNull();
  });

  it('opens owned species and badges with how they are held', async () => {
    await openItem('species', 'signature', 'Signature');
    expect(screen.getByText('Part of every forest.')).toBeOnTheScreen();
    expect(screen.getByText('Growing this month')).toBeOnTheScreen();
    screen.unmount();

    await openItem('species', 'oak', 'Oak');
    expect(screen.getByText('In your collection.')).toBeOnTheScreen();
    // An example of the species, not the user's tree: its name is what is read.
    expect(screen.queryByRole('image')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: "Choose this month's tree" }));
    await screen.findByRole('header', { name: "Choose this month's tree" });
    screen.unmount();

    server.state.showcase = ['first-session'];
    await openItem('badge', 'first-session', 'First Session');
    expect(screen.getByText('On your showcase')).toBeOnTheScreen();
    screen.unmount();

    await openItem('badge', 'streak-7', '7-Day Streak');
    expect(screen.getByText('3 / 7 days')).toBeOnTheScreen();
  });

  it('opens the item of the kind asked for, when two kinds share an id', async () => {
    // Ids are unique within a catalog, not across them.
    server.state.extraBadges = [
      { ...FIRST_SESSION_ITEM, id: 'oak', name: 'Oak Grove', artworkId: 'oak' } as CollectionItem,
    ];
    await openItem('badge', 'oak', 'Oak Grove');
    screen.unmount();
    await openItem('species', 'oak', 'Oak');
  });

  it('says an item is no longer in the collection when the server no longer lists it', async () => {
    await openItem('cosmetic', 'aurora', 'Collection Book');
    await shows('This item isn’t in your collection.');
  });
});

describe('the Collection Book follows changes made elsewhere', () => {
  it('marks the month’s species once it was chosen', async () => {
    await openItem('species', 'oak', 'Oak');
    fireEvent.press(screen.getByRole('button', { name: "Choose this month's tree" }));
    fireEvent.press(await screen.findByRole('button', { name: 'Choose Oak' }));
    await shows("This month's tree is an Oak.");
    act(() => router.back());
    await shows('Growing this month');
  });

  it('marks a badge pinned from Achievements', async () => {
    await openItem('badge', 'first-session', 'First Session');
    expect(screen.queryByText('On your showcase')).toBeNull();
    act(() => router.navigate('/profile/achievements'));
    fireEvent.press(
      await screen.findByRole('button', { name: 'Pin First Session to your showcase' }),
    );
    await until(() => server.state.showcase.length === 1);
    // Back to the detail that stayed open underneath (Achievements opened above Profile): only
    // a refresh can update it.
    act(() => router.back());
    act(() => router.back());
    await screen.findByRole('header', { name: 'First Session' });
    await shows('On your showcase');
  });
});

describe('equipping from the Collection Book: online, server-confirmed (docs/05)', () => {
  it('uses an owned decoration in the garden, and Home draws it', async () => {
    await openItem('cosmetic', 'stone-lantern', 'Stone Lantern');
    const before = collectionReads();
    fireEvent.press(screen.getByRole('button', { name: 'Use in your garden' }));
    await shows('In your garden');
    expect(equipCalls()).toEqual([['PUT', 'decoration', { cosmeticId: 'stone-lantern' }]]);
    // The collection is read again, so `equipped` stays the server's.
    expect(collectionReads()).toBeGreaterThan(before);
    // The answer is the equipment: Home draws it from that answer, without a new read.
    server.state.equipmentSilent = true;
    act(() => router.navigate('/'));
    await until(() => screen.queryByTestId('scene-decoration-stone-lantern', hidden) !== null);
  });

  it('shows nothing as used until the server answered', async () => {
    server.state.hold = true;
    await openItem('cosmetic', 'stone-lantern', 'Stone Lantern');
    fireEvent.press(screen.getByRole('button', { name: 'Use in your garden' }));
    await until(() => server.state.held.length === 1);
    await pause();
    expect(screen.queryByText('In your garden')).toBeNull();
    expect(screen.getByRole('button', { name: 'Use in your garden' })).toBeDisabled();
    act(() => server.state.held.shift()!());
    await shows('In your garden');
  });

  it('stops using an equipped cosmetic', async () => {
    server.state.equipment = makeEquipment({ decoration: STONE_LANTERN });
    await openItem('cosmetic', 'stone-lantern', 'Stone Lantern');
    await shows('In your garden');
    fireEvent.press(screen.getByRole('button', { name: 'Stop using' }));
    await screen.findByRole('button', { name: 'Use in your garden' });
    expect(equipCalls()).toEqual([['DELETE', 'decoration', undefined]]);
  });

  it('puts an owned frame on the profile', async () => {
    await openItem('cosmetic', 'twig-frame', 'Twig Frame');
    fireEvent.press(screen.getByRole('button', { name: 'Use on your profile' }));
    await shows('On your profile');
    expect(equipCalls()).toEqual([['PUT', 'profile_frame', { cosmeticId: 'twig-frame' }]]);
    act(() => router.navigate('/profile'));
    await until(() => screen.queryByTestId('avatar-frame-twig-frame', hidden) !== null);
  });

  it('changes nothing offline, and says so', async () => {
    await openItem('cosmetic', 'stone-lantern', 'Stone Lantern');
    server.state.offline = true;
    fireEvent.press(screen.getByRole('button', { name: 'Use in your garden' }));
    await shows('Changing your garden needs a connection. Nothing was changed.');
    expect(screen.queryByText('In your garden')).toBeNull();
    expect(server.state.equipment.forest.decoration).toBeNull();
  });

  it('answers a refusal calmly, reads the collection again, and never shows the code', async () => {
    await openItem('cosmetic', 'stone-lantern', 'Stone Lantern');
    const before = collectionReads();
    server.state.equipAnswer = {
      status: 422,
      body: {
        ...nestError(422, 'Only cosmetics you own can be used.'),
        code: 'cosmetic_not_owned',
      },
    };
    fireEvent.press(screen.getByRole('button', { name: 'Use in your garden' }));
    await shows("That can't be used right now.");
    await until(() => collectionReads() > before);
    expect(screen.queryByText(/cosmetic_not_owned|Only cosmetics/)).toBeNull();
    expect(screen.queryByText('In your garden')).toBeNull();
  });

  it('offers nothing to use for a locked cosmetic, a badge, or a species', async () => {
    await openItem('cosmetic', 'misty-hills', 'Misty Hills');
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull();
    screen.unmount();
    await openItem('badge', 'first-session', 'First Session');
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull();
  });
});

describe('Profile progression: a small vignette of recent trees (docs/05 §3)', () => {
  it('shows up to three recent archived trees, and opens the Forest', async () => {
    renderApp(appRoutes, { initialUrl: '/profile' });
    await until(() => screen.queryByTestId('profile-forest') !== null);
    // forestMonths(5): growing, three archived, one resting. Only archived trees, newest first;
    // the vignette is the only scene on Profile.
    const trees = screen.UNSAFE_getAllByType(TreeScene).map((s) => s.props.tree);
    expect(trees.map((tree) => [tree.lifecycle, tree.month])).toEqual([
      ['archived', 9],
      ['archived', 8],
      ['archived', 7],
    ]);
    fireEvent.press(screen.getByRole('button', { name: 'Your forest, 3 recent trees' }));
    await screen.findByRole('header', { name: 'Forest' });
  });

  it('is absent before the first archived tree, or when the forest cannot load', async () => {
    server.state.forest = forestMonths(1);
    renderApp(appRoutes, { initialUrl: '/profile' });
    await screen.findByText('Mai Anh');
    await pause(500);
    expect(screen.queryByTestId('profile-forest')).toBeNull();
  });
});
