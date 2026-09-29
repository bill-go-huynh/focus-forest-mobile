import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { NetworkError, type Topic } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';
import { topicCreateQueueKey } from '../topics/topic-create-queue';
import { TopicSnapshotStore } from '../topics/topic-snapshot-store';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));
// The native generator's jest mock returns nothing; the runtime's Web Crypto stands in.
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const API = 'https://api.example.com';
const USER = 'user-1';
const PROFILE = {
  id: USER,
  displayName: 'Mai Anh',
  avatarUrl: null,
  bio: null,
  joinDate: '2026-09-26T10:00:00.000Z',
  timezone: 'Europe/Zurich',
};

// Reading was created before Piano; the server lists topics in creation order.
const piano = makeTopic({
  id: '6e2d4a6f-3b5c-4d7e-9f80-0b1c2d3e4f50',
  name: 'Piano',
  description: null,
  color: 'topic.2',
  icon: 'music',
  createdAt: '2026-09-21T09:00:00.000Z',
});
const reading = makeTopic({
  id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Reading',
  description: 'Novels',
  color: 'topic.1',
  icon: 'book',
  createdAt: '2026-09-20T09:00:00.000Z',
});
const archivedSpanish = makeTopic({
  id: '7f3e5b70-4c6d-4e8f-a091-1c2d3e4f5061',
  name: 'Spanish',
  description: null,
  color: 'topic.3',
  status: 'archived',
  archivedAt: '2026-09-22T09:00:00.000Z',
  createdAt: '2026-09-19T09:00:00.000Z',
});

type Reply = { status: number; body?: unknown } | Error;

const conflict = (code: string) => ({
  status: 409,
  body: { statusCode: 409, message: 'Whatever the text.', code },
});

/**
 * A2.2 and A2.8 as implemented: lists in creation order, `status` filters; PUT creates once per
 * id (a replay answers 200); a name is taken when another active topic has it, ignoring case;
 * PATCH applies only the fields sent; archive and restore answer the topic. `offline` fails
 * every topic request; `listsDown` fails only the lists.
 */
function topicsApi(initial: Topic[]) {
  const topics = [...initial];
  const state = { offline: false, listsDown: false };
  const taken = (name: string, except?: string) =>
    topics.some(
      (t) =>
        t.id !== except && t.status === 'active' && t.name.toLowerCase() === name.toLowerCase(),
    );
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/me/profile') return { status: 200, body: PROFILE };
    if (!pathname.startsWith('/me/topics')) return { status: 404, body: nestError(404, 'x') };
    if (state.offline) return new NetworkError();
    const [, , , id = '', action] = pathname.split('/');
    const index = topics.findIndex((t) => t.id === id);
    if (method === 'GET') {
      if (state.listsDown) return new NetworkError();
      const status = searchParams.get('status');
      return { status: 200, body: topics.filter((t) => !status || t.status === status) };
    }
    if (method === 'PUT') {
      if (index >= 0) return { status: 200, body: topics[index] };
      const fields = body as { name: string; icon: string; color: string; description: null };
      if (taken(fields.name)) return conflict('topic_name_taken');
      const created = makeTopic({
        id,
        ...fields,
        createdAt: '2026-09-26T10:00:00.000Z',
        lastUsedAt: null,
        lastPlannedMinutes: null,
      });
      topics.push(created);
      return { status: 201, body: created };
    }
    const current = topics[index];
    if (!current) return { status: 404, body: nestError(404, 'Topic not found.') };
    let next: Topic = current;
    if (method === 'PATCH') {
      const changes = body as Partial<Topic>;
      if (changes.name !== undefined && taken(changes.name, id)) {
        return conflict('topic_name_taken');
      }
      next = { ...current, ...changes };
    } else if (action === 'archive') {
      next = { ...current, status: 'archived', archivedAt: '2026-09-26T11:00:00.000Z' };
    } else if (action === 'restore') {
      if (taken(current.name, id)) return conflict('topic_name_taken');
      next = { ...current, status: 'active', archivedAt: null };
    }
    topics[index] = next;
    return { status: 200, body: next };
  };
  return { handler, state, topics };
}

let requests: FakeRequest[];
let server: ReturnType<typeof topicsApi>;

function serve(handler: (request: FakeRequest) => Reply | Promise<Reply>) {
  const net = fakeFetch(handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

const originalFetch = globalThis.fetch;
const setItem = AsyncStorage.setItem as jest.Mock;
const originalSetItem = setItem.getMockImplementation();
beforeEach(async () => {
  setItem.mockImplementation(originalSetItem);
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest();
  server = topicsApi([reading, piano, archivedSpanish]);
  serve(server.handler);
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const topicWrites = (method: string) =>
  requests.filter((r) => r.method === method && r.url.startsWith(`${API}/me/topics/`));
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });
const findRow = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name}\\b`) });
const rowNames = () =>
  screen
    .getAllByRole('button')
    .map((element) => element.props.accessibilityLabel as string | undefined)
    .filter((label): label is string =>
      /^(Piano|Reading|Spanish|Books|Drawing)\b/.test(label ?? ''),
    );

const closed = (label: string) => () => screen.queryByLabelText(label) === null;

async function openTopics() {
  renderApp(appRoutes, { initialUrl: '/profile/topics' });
  await screen.findByRole('header', { name: 'Topics' });
}

async function openCreate() {
  fireEvent.press(await screen.findByRole('button', { name: 'Create topic' }));
  return screen.findByLabelText('Name');
}

async function saveAsCreate(name: string) {
  fireEvent.changeText(await openCreate(), name);
  fireEvent.press(screen.getByRole('button', { name: 'Create' }));
}

/** Saves the lists on the device, as an earlier launch that reached the server did. */
async function savedOnDevice(topics: Topic[]) {
  const store = new TopicSnapshotStore({ storage: AsyncStorage, report: () => undefined });
  await store.activate(USER);
  await store.save(USER, { status: 'active' }, topics, Date.parse('2026-09-25T10:00:00.000Z'));
}

describe('Topics screen (Profile → Topics)', () => {
  it('is reached from Profile', async () => {
    renderApp(appRoutes, { initialUrl: '/profile' });
    fireEvent.press(await screen.findByRole('button', { name: 'Topics' }));
    expect(await screen.findByRole('header', { name: 'Topics' })).toBeOnTheScreen();
  });

  it('lists the active topics in the server order, each read by its name', async () => {
    await openTopics();
    await findRow('Reading');
    // Reading was created first: the server's order, not alphabetical and not by use.
    expect(rowNames()).toEqual(['Reading, Novels', 'Piano']);
    expect(screen.queryByText('Spanish')).toBeNull();
  });

  it('switches to the archived topics, with the selection announced', async () => {
    await openTopics();
    await findRow('Reading');
    const active = screen.getByRole('button', { name: 'Active' });
    expect(active.props.accessibilityState).toMatchObject({ selected: true });

    fireEvent.press(screen.getByRole('button', { name: 'Archived' }));

    expect(await screen.findByText('Spanish')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Archived' }).props.accessibilityState).toMatchObject(
      { selected: true },
    );
    expect(screen.queryByText('Reading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore Spanish' })).toBeOnTheScreen();
  });

  it('invites a first topic when there are none', async () => {
    server = topicsApi([]);
    serve(server.handler);
    await openTopics();
    expect(
      await screen.findByText('Topics are what you focus on, in your own words.'),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Create topic' }).length).toBeGreaterThan(0);
  });

  it('offers a retry when the topics could not be loaded and none are saved', async () => {
    server.state.listsDown = true;
    await openTopics();
    expect(
      await screen.findByText("We couldn't load your topics right now.", {}, { timeout: 10_000 }),
    ).toBeOnTheScreen();

    server.state.listsDown = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await findRow('Reading')).toBeOnTheScreen();
  });

  it('keeps showing the topics saved on the device when the server cannot be reached', async () => {
    await savedOnDevice([reading, piano]);
    server.state.offline = true;
    await openTopics();

    expect(await findRow('Reading')).toBeOnTheScreen();
    expect(
      await screen.findByText('Showing topics saved on this device.', {}, { timeout: 10_000 }),
    ).toBeOnTheScreen();
    expect(screen.queryByText("We couldn't load your topics right now.")).toBeNull();
  });
});

describe('creating a topic (name only)', () => {
  it('asks only for a name and sends the fixed defaults, then closes', async () => {
    await openTopics();
    await findRow('Reading');
    await openCreate();
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Color / })).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Name'), '  Drawing ');
    fireEvent.press(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(topicWrites('PUT')).toHaveLength(1));
    expect(topicWrites('PUT')[0]?.body).toEqual({
      name: 'Drawing',
      icon: 'topic.default',
      color: 'topic.1',
      description: null,
    });
    await until(closed('Name'));
    expect(await findRow('Drawing')).toBeOnTheScreen();
  });

  it('shows a topic created offline at once, waiting to sync', async () => {
    await openTopics();
    await findRow('Reading');
    server.state.offline = true;

    await saveAsCreate('Drawing');

    expect(
      await screen.findByRole('button', { name: 'Drawing, Waiting to sync' }),
    ).toBeOnTheScreen();
    await until(closed('Name'));
  });

  it('checks the name before saving it', async () => {
    await openTopics();
    await findRow('Reading');
    await openCreate();

    fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Add a name for this topic.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Name'), 'a'.repeat(101));
    fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Keep the name to 100 characters or fewer.')).toBeOnTheScreen();
    expect(topicWrites('PUT')).toHaveLength(0);
  });

  it('keeps the form open, with its text, when the topic could not be saved on the device', async () => {
    await openTopics();
    await findRow('Reading');
    setItem.mockImplementation(async (key: string, value: string) => {
      if (key === topicCreateQueueKey(USER)) throw new Error('disk full');
      return originalSetItem?.(key, value);
    });

    await saveAsCreate('Drawing');

    expect(
      await screen.findByText("We couldn't save this topic on your device."),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Name').props.value).toBe('Drawing');
    expect(screen.getByRole('button', { name: 'Create' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Drawing\b/ })).toBeNull();
    expect(topicWrites('PUT')).toHaveLength(0);
  });

  it('asks calmly for another name when it is taken, and syncs the same topic once renamed', async () => {
    await openTopics();
    await findRow('Reading');

    await saveAsCreate('reading');
    await until(closed('Name'));

    const pending = await waitFor(() =>
      screen.getByRole('button', {
        name: 'reading, Choose another name to sync this topic.',
      }),
    );
    const id = topicWrites('PUT')[0]?.url.split('/').at(-1);
    fireEvent.press(pending);
    fireEvent.changeText(await screen.findByLabelText('Name'), 'Book club');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await until(closed('Name'));

    expect(await findRow('Book club')).toBeOnTheScreen();
    const puts = topicWrites('PUT');
    expect(puts.at(-1)?.url).toBe(`${API}/me/topics/${id}`);
    expect(puts.at(-1)?.body).toEqual({
      name: 'Book club',
      icon: 'topic.default',
      color: 'topic.1',
      description: null,
    });
  });
});

describe('queued topics', () => {
  function queued(state: string, attempted: boolean) {
    return JSON.stringify({
      version: 1,
      items: [
        {
          id: 'aaaaaaaa-0000-4000-8000-00000000000a',
          payload: { name: 'Drawing', icon: 'topic.default', color: 'topic.1', description: null },
          state,
          attempted,
          queuedAt: 1,
        },
      ],
    });
  }

  it('shows a topic whose first send had no answer, but never edits its frozen fields', async () => {
    await AsyncStorage.setItem(topicCreateQueueKey(USER), queued('pending', true));
    server.state.offline = true;
    await openTopics();

    fireEvent.press(await screen.findByRole('button', { name: 'Drawing, Waiting to sync' }));

    expect(
      await waitFor(() =>
        screen.getByText(
          'This topic is saved on this device and will sync when you are back online.',
        ),
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('keeps a topic that needs a look visible, without internal codes, and never retries it', async () => {
    await AsyncStorage.setItem(topicCreateQueueKey(USER), queued('needs_attention', true));
    await openTopics();

    const pending = await waitFor(() =>
      screen.getByRole('button', {
        name: 'Drawing, This topic needs a look before it can sync.',
      }),
    );
    fireEvent.press(pending);
    expect(await screen.findByText('It stays saved on this device.')).toBeOnTheScreen();
    expect(screen.queryByText(/topic_id_conflict|conflict/)).toBeNull();
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(topicWrites('PUT')).toHaveLength(0);
  });
});

describe('editing a topic the server has', () => {
  async function openEdit(name: string) {
    await openTopics();
    fireEvent.press(await findRow(name));
    return screen.findByLabelText('Name');
  }

  it('sends only the changed name, description, and color, never the icon', async () => {
    await openEdit('Reading');
    fireEvent.changeText(screen.getByLabelText('Name'), 'Books');
    fireEvent.changeText(screen.getByLabelText('Description'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Color 4' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await until(closed('Name'));

    await waitFor(() => expect(topicWrites('PATCH')).toHaveLength(1));
    expect(topicWrites('PATCH')[0]?.body).toEqual({
      name: 'Books',
      description: null,
      color: 'topic.4',
    });
    expect(await findRow('Books')).toBeOnTheScreen();
    expect(server.topics.find((t) => t.id === reading.id)?.icon).toBe('book');
  });

  it('shows the twelve colors by label, with the current one selected', async () => {
    await openEdit('Reading');
    for (let n = 1; n <= 12; n += 1) {
      const option = screen.getByRole('button', { name: `Color ${n}` });
      expect(option.props.accessibilityState).toMatchObject({ selected: n === 1 });
    }
    fireEvent.press(screen.getByRole('button', { name: 'Color 7' }));
    expect(screen.getByRole('button', { name: 'Color 7' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('button', { name: 'Color 1' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('keeps the edit open and the old topic shown when it could not be saved', async () => {
    await openEdit('Reading');
    server.state.offline = true;
    fireEvent.changeText(screen.getByLabelText('Name'), 'Books');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("We couldn't save your changes right now.")).toBeOnTheScreen();
    expect(screen.getByLabelText('Name').props.value).toBe('Books');
    expect(screen.queryByRole('button', { name: /^Books\b/ })).toBeNull();
    expect(row('Reading')).toBeOnTheScreen();
  });

  it('says calmly when another active topic has the name', async () => {
    await openEdit('Reading');
    fireEvent.changeText(screen.getByLabelText('Name'), 'piano');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Another active topic already uses this name.'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Name')).toBeOnTheScreen();
  });

  it('closes without a request when nothing changed', async () => {
    await openEdit('Reading');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await until(closed('Name'));
    expect(topicWrites('PATCH')).toHaveLength(0);
  });
});

describe('archiving and restoring', () => {
  it('archives after saying history stays, then shows it under Archived', async () => {
    await openTopics();
    fireEvent.press(await findRow('Reading'));
    fireEvent.press(await screen.findByRole('button', { name: 'Archive topic' }));

    expect(await screen.findByText('Archive this topic?')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Your past focus sessions will stay in history. You can restore it anytime.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/delete|remove|permanent/i)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Archive' }));
    await until(() => screen.queryByText('Archive this topic?') === null);

    await waitFor(() => expect(topicWrites('POST')).toHaveLength(1));
    expect(topicWrites('POST')[0]?.url).toBe(`${API}/me/topics/${reading.id}/archive`);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Reading\b/ })).toBeNull());

    fireEvent.press(screen.getByRole('button', { name: 'Archived' }));
    expect(await screen.findByRole('button', { name: 'Restore Reading' })).toBeOnTheScreen();
  });

  it('keeps the topic when archiving is cancelled', async () => {
    await openTopics();
    fireEvent.press(await findRow('Reading'));
    fireEvent.press(await screen.findByRole('button', { name: 'Archive topic' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
    await until(() => screen.queryByText('Archive this topic?') === null);
    expect(topicWrites('POST')).toHaveLength(0);
    expect(row('Reading')).toBeOnTheScreen();
  });

  it('restores an archived topic in one tap', async () => {
    await openTopics();
    await findRow('Reading');
    fireEvent.press(screen.getByRole('button', { name: 'Archived' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Restore Spanish' }));

    await waitFor(() =>
      expect(topicWrites('POST')[0]?.url).toBe(`${API}/me/topics/${archivedSpanish.id}/restore`),
    );
    await waitFor(() => expect(screen.queryByText('Spanish')).toBeNull());
    fireEvent.press(screen.getByRole('button', { name: 'Active' }));
    expect(await findRow('Spanish')).toBeOnTheScreen();
  });

  it('says so when an active topic already has the name, and renames nothing', async () => {
    server = topicsApi([piano, reading, makeTopic({ ...archivedSpanish, name: 'piano' })]);
    serve(server.handler);
    await openTopics();
    await findRow('Reading');
    fireEvent.press(screen.getByRole('button', { name: 'Archived' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Restore piano' }));

    expect(await screen.findByText('An active topic already uses this name.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Restore piano' })).toBeOnTheScreen();
    expect(topicWrites('PATCH')).toHaveLength(0);
  });

  it('says so calmly when restoring could not reach the server', async () => {
    await openTopics();
    await findRow('Reading');
    fireEvent.press(screen.getByRole('button', { name: 'Archived' }));
    await screen.findByRole('button', { name: 'Restore Spanish' });
    server.state.offline = true;
    fireEvent.press(screen.getByRole('button', { name: 'Restore Spanish' }));

    expect(await screen.findByText("We couldn't restore this topic right now.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Restore Spanish' })).toBeOnTheScreen();
  });
});

describe('at 200% text', () => {
  it('keeps every topic, status, and action on the screen', async () => {
    mockWindow.fontScale = 2;
    await AsyncStorage.setItem(
      topicCreateQueueKey(USER),
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'aaaaaaaa-0000-4000-8000-00000000000a',
            payload: {
              name: 'Drawing',
              icon: 'topic.default',
              color: 'topic.1',
              description: null,
            },
            state: 'needs_name_change',
            attempted: false,
            queuedAt: 1,
          },
        ],
      }),
    );
    server.state.offline = true;
    await savedOnDevice([reading, piano]);
    await openTopics();

    expect(await findRow('Reading')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Drawing, Choose another name to sync this topic.' }),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Create topic' }).length).toBeGreaterThan(0);
    const status = await screen.findByText(
      'Showing topics saved on this device.',
      {},
      { timeout: 10_000 },
    );
    expect(status.props.numberOfLines).toBeUndefined();
    expect(within(screen.getByTestId('topics-list')).getAllByRole('button').length).toBe(3);
  });
});
