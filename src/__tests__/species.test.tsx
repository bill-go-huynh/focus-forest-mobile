import { act, fireEvent, screen } from 'expo-router/testing-library';

import { NetworkError, type HomeResponse } from '../api';
import type { Equipment, SpeciesList } from '../api/progression';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { archivedDetails } from '../test-utils/forest';
import { makeLifetime } from '../test-utils/insights';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import {
  makeEquipment,
  makeSpeciesList,
  MISTY_HILLS,
  OAK,
  SAKURA,
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

/**
 * A4.3 as these tests script it: the month's tree, the owned species and whether the choice is
 * open, the equipped garden, and a species PUT that stores the choice and answers the tree (or
 * `selectAnswer`). Whether a species can be chosen is the server's; the fake only stores it.
 */
function speciesApi() {
  const state = {
    offline: false,
    speciesId: 'signature',
    stage: 'seed' as 'seed' | 'sprout' | 'mature_tree',
    species: [SIGNATURE, OAK, SAKURA],
    equipment: makeEquipment() as Equipment,
    selectAnswer: null as Reply | null,
  };
  const tree = () =>
    treeDto({
      stage: state.stage,
      fullness: 0,
      blossoms: 0,
      species: state.speciesId,
    });
  const list = (): SpeciesList =>
    makeSpeciesList(state.species, {
      speciesId: state.speciesId,
      locked: state.stage !== 'seed',
    });
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home') {
      const home: HomeResponse = { ...makeHome(), tree: tree() };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current' && method === 'GET')
      return { status: 200, body: { ...makeCurrentTree(), tree: tree() } };
    if (pathname === '/me/species') return { status: 200, body: list() };
    if (pathname === '/me/equipment') return { status: 200, body: state.equipment };
    if (pathname === '/me/profile')
      return {
        status: 200,
        body: {
          id: 'user-1',
          displayName: 'Mai Anh',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-09-26T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    if (pathname === '/me/profile/stats') return { status: 200, body: makeLifetime() };
    if (pathname === '/me/badges') return { status: 200, body: { items: [], showcase: [] } };
    if (pathname === '/me/trees/2026/9') return { status: 200, body: archivedDetails() };
    if (pathname === '/me/trees/current/species' && method === 'PUT') {
      if (state.selectAnswer) {
        const answer = state.selectAnswer;
        state.selectAnswer = null;
        return answer;
      }
      state.speciesId = (body as { speciesId: string }).speciesId;
      return { status: 200, body: { ...makeCurrentTree(), tree: tree() } };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof speciesApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = speciesApi();
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
const speciesPuts = () =>
  requests.filter((r) => r.method === 'PUT' && r.url === `${API}/me/trees/current/species`);
const sceneTree = () => screen.UNSAFE_getAllByType(TreeScene)[0]!.props.tree;
const CHOOSE = "Choose this month's tree";

async function openHome() {
  renderApp(appRoutes, { initialUrl: '/' });
  await screen.findByRole('button', { name: /Start Focus/ });
  await screen.findByRole('image');
}

async function openChooser() {
  renderApp(appRoutes, { initialUrl: '/species' });
  await screen.findByRole('header', { name: CHOOSE });
  await shows('Sakura');
}

describe('species choice on Home: optional, only while it is open (docs/03 §9, docs/05)', () => {
  it('offers the choice while the month’s tree is a Seed and more than one species is owned', async () => {
    await openHome();
    fireEvent.press(await screen.findByRole('button', { name: CHOOSE }));
    await screen.findByRole('header', { name: CHOOSE });
  });

  it('offers nothing once the tree grew, or with one species, and never blocks Start Focus', async () => {
    server.state.stage = 'sprout';
    await openHome();
    await pause();
    expect(screen.queryByRole('button', { name: CHOOSE })).toBeNull();
    expect(screen.getByRole('button', { name: /Start Focus/ })).toBeOnTheScreen();
    screen.unmount();

    server.state.stage = 'seed';
    server.state.species = [SIGNATURE];
    await openHome();
    await pause();
    expect(screen.queryByRole('button', { name: CHOOSE })).toBeNull();
  });

  it('does not ask for species while the tree is not a Seed', async () => {
    server.state.stage = 'mature_tree';
    await openHome();
    await pause();
    expect(requests.some((r) => r.url === `${API}/me/species`)).toBe(false);
  });
});

describe('choosing this month’s tree', () => {
  it('lists the owned species with previews drawn in each species, the current one marked', async () => {
    await openChooser();
    const previews = screen.UNSAFE_getAllByType(TreeScene).map((scene) => scene.props.tree.species);
    expect(new Set(previews)).toEqual(new Set(['signature', 'oak', 'sakura']));
    expect(screen.getByText('Growing this month')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose Oak' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Choose Signature' })).toBeNull();
  });

  it('sends the choice and shows the server’s tree in the new species', async () => {
    await openChooser();
    fireEvent.press(screen.getByRole('button', { name: 'Choose Sakura' }));
    await shows("This month's tree is a Sakura.");
    expect(speciesPuts().map((r) => r.body)).toEqual([{ speciesId: 'sakura' }]);
    await until(() => screen.queryByRole('button', { name: 'Choose Oak' }) !== null);
  });

  it('says calmly when the tree already started growing, and reads the choice again', async () => {
    server.state.selectAnswer = {
      status: 409,
      body: { ...nestError(409, 'No.'), code: 'species_locked' },
    };
    await openChooser();
    const before = requests.filter((r) => r.url === `${API}/me/species`).length;
    server.state.stage = 'sprout';
    fireEvent.press(screen.getByRole('button', { name: 'Choose Oak' }));
    await shows("This month's tree has already started growing. You can choose again next month.");
    await until(() => requests.filter((r) => r.url === `${API}/me/species`).length > before);
    expect(screen.queryByText(/species_locked|No\./)).toBeNull();
  });

  it('changes nothing offline and says so', async () => {
    await openChooser();
    server.state.offline = true;
    fireEvent.press(screen.getByRole('button', { name: 'Choose Oak' }));
    await shows('Choosing a species needs a connection. Nothing was changed.');
    expect(server.state.speciesId).toBe('signature');
    // Nothing optimistic: Oak is still offered, Signature still the month's tree.
    expect(screen.getByRole('button', { name: 'Choose Oak' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Choose Signature' })).toBeNull();
  });

  it('shows the month’s species read-only once it is locked', async () => {
    server.state.stage = 'sprout';
    server.state.speciesId = 'oak';
    renderApp(appRoutes, { initialUrl: '/species' });
    await shows("This month's tree is growing as an Oak. You can choose again next month.");
    expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull();
  });
});

describe('Tree Details names the species', () => {
  it('shows the month’s species and the way to change it while open', async () => {
    renderApp(appRoutes, { initialUrl: '/tree' });
    await shows('Species: Signature');
    fireEvent.press(await screen.findByRole('button', { name: 'Change species' }));
    await screen.findByRole('header', { name: CHOOSE });
  });

  it('only names it once locked', async () => {
    server.state.stage = 'sprout';
    server.state.speciesId = 'sakura';
    renderApp(appRoutes, { initialUrl: '/tree' });
    await shows('Species: Sakura');
    await pause();
    expect(screen.queryByRole('button', { name: 'Change species' })).toBeNull();
  });
});

describe('the equipped garden and profile frame', () => {
  it('draws the equipped background and decoration around this month’s tree on Home', async () => {
    server.state.stage = 'mature_tree';
    server.state.equipment = makeEquipment({ background: MISTY_HILLS, decoration: STONE_LANTERN });
    await openHome();
    await until(() => screen.queryByTestId('scene-decoration-stone-lantern', hidden) !== null);
    expect(screen.getByTestId('scene-background-misty-hills', hidden)).toBeTruthy();
    expect(sceneTree().species).toBe('signature');
  });

  it('keeps an archived month in its own neutral garden', async () => {
    server.state.equipment = makeEquipment({ decoration: STONE_LANTERN });
    renderApp(appRoutes, { initialUrl: '/month/2026/9' });
    await screen.findByRole('button', { name: 'View recap' });
    await pause();
    expect(screen.queryByTestId(/^scene-(background|decoration)-/, hidden)).toBeNull();
  });

  it('frames the profile avatar with the equipped frame, and nothing else', async () => {
    server.state.equipment = makeEquipment({ decoration: STONE_LANTERN }, TWIG_FRAME);
    renderApp(appRoutes, { initialUrl: '/profile' });
    await screen.findByRole('header', { name: 'Profile' });
    await until(() => screen.queryByTestId('avatar-frame-twig-frame', hidden) !== null);
    expect(screen.queryByTestId(/^scene-decoration-/, hidden)).toBeNull();
  });
});
