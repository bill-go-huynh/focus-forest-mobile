import { quarantineKeyOf, type StorageIssue } from '../../common/stored-json';
import { memoryStorage } from '../../test-utils/storage';
import { onboardingKey, OnboardingStore } from '../onboarding-store';

const ADA = 'user-ada';
const GRACE = 'user-grace';
type Storage = ReturnType<typeof memoryStorage>;

function launch(storage: Storage = memoryStorage()) {
  const issues: StorageIssue[] = [];
  const store = new OnboardingStore({ storage, report: (issue) => issues.push(issue) });
  return { store, storage, issues };
}
async function ready(storage?: Storage, userId = ADA) {
  const app = launch(storage);
  await app.store.activate(userId);
  return app;
}
const stored = (storage: Storage, userId = ADA) => {
  const raw = storage.data.get(onboardingKey(userId));
  return raw === undefined ? null : JSON.parse(raw);
};

describe('OnboardingStore', () => {
  it('treats no record as not pending: accounts from before onboarding go straight in', async () => {
    const { store } = await ready();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', userId: ADA, onboarding: null });
  });

  it('marks a new account pending durably, at the first step', async () => {
    const { store, storage } = await ready();
    await expect(store.markPending(ADA)).resolves.toBe(true);
    expect(stored(storage)).toEqual({ version: 1, status: 'pending', step: 'concept' });
    expect(store.getSnapshot().onboarding).toEqual({ status: 'pending', step: 'concept' });
  });

  it('keeps the step across a restart, and completion for good', async () => {
    const storage = memoryStorage();
    const first = await ready(storage);
    await first.store.markPending(ADA);
    await first.store.reachStep(ADA, 'goal');
    expect((await ready(storage)).store.getSnapshot().onboarding).toEqual({
      status: 'pending',
      step: 'goal',
    });
    const second = await ready(storage);
    await second.store.reachStep(ADA, 'first-session');
    await second.store.complete(ADA);
    const third = await ready(storage);
    expect(third.store.getSnapshot().onboarding).toEqual({ status: 'complete' });
    // A completed onboarding never becomes pending or moves again.
    await third.store.reachStep(ADA, 'concept');
    expect(third.store.getSnapshot().onboarding).toEqual({ status: 'complete' });
  });

  it('marks pending while the user is still being read, without losing either', async () => {
    const storage = memoryStorage();
    const { store } = launch(storage);
    const reading = store.activate(ADA);
    const marking = store.markPending(ADA);
    await reading;
    await expect(marking).resolves.toBe(true);
    expect(store.getSnapshot().onboarding).toEqual({ status: 'pending', step: 'concept' });
  });

  it('stores a new account’s mark even before its user is active', async () => {
    const storage = memoryStorage();
    const { store } = launch(storage);
    await expect(store.markPending(ADA)).resolves.toBe(true);
    await store.activate(ADA);
    expect(store.getSnapshot().onboarding).toEqual({ status: 'pending', step: 'concept' });
  });

  it('keeps each user’s onboarding apart', async () => {
    const storage = memoryStorage();
    const ada = await ready(storage);
    await ada.store.markPending(ADA);
    const grace = await ready(storage, GRACE);
    expect(grace.store.getSnapshot().onboarding).toBeNull();
    // A write for a user who is not active never changes what the active user sees.
    await grace.store.reachStep(ADA, 'goal');
    expect(grace.store.getSnapshot()).toMatchObject({ userId: GRACE, onboarding: null });
    expect(stored(storage, GRACE)).toBeNull();
  });

  it('forgets it in memory on sign-out; storage keeps it', async () => {
    const storage = memoryStorage();
    const { store } = await ready(storage);
    await store.markPending(ADA);
    store.deactivate();
    expect(store.getSnapshot()).toMatchObject({ status: 'inactive', onboarding: null });
    await store.activate(ADA);
    expect(store.getSnapshot().onboarding).toEqual({ status: 'pending', step: 'concept' });
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['an invalid state', JSON.stringify({ version: 1, status: 'pending', step: 'nowhere' })],
  ])('quarantines %s and lets the user into the app', async (_, raw) => {
    const storage = memoryStorage({ [onboardingKey(ADA)]: raw });
    const { store, issues } = await ready(storage);
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', onboarding: null });
    expect(storage.data.get(quarantineKeyOf(onboardingKey(ADA)))).toBe(raw);
    expect(issues.map((issue) => issue.code)).toHaveLength(1);
  });

  it('lets the user in when storage cannot be read, and writes nothing over it', async () => {
    const storage = memoryStorage({
      [onboardingKey(ADA)]: JSON.stringify({ version: 1, status: 'complete' }),
    });
    storage.failing.getItem = true;
    const { store } = await ready(storage);
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', onboarding: null });
    await expect(store.reachStep(ADA, 'goal')).resolves.toBe(false);
    storage.failing.getItem = false;
    expect(stored(storage)).toEqual({ version: 1, status: 'complete' });
  });

  it('keeps a pending mark in memory for this launch when it cannot be stored', async () => {
    const storage = memoryStorage();
    const { store } = await ready(storage);
    storage.failing.setItem = true;
    await expect(store.markPending(ADA)).resolves.toBe(false);
    expect(store.getSnapshot().onboarding).toEqual({ status: 'pending', step: 'concept' });
  });
});
