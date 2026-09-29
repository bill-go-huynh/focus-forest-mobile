import type { FocusSession } from '../../api/sessions';
import { quarantineKeyOf, type StorageIssue } from '../../common/stored-json';
import { makeSessionResult } from '../../test-utils/sessions';
import { memoryStorage } from '../../test-utils/storage';
import {
  COMPLETION_RECEIPTS_MAX,
  completionReceiptsKey,
  CompletionReceipts,
  receiptFor,
} from '../completion-receipts';

const ADA = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';

/** The n-th session id, all distinct and valid. */
const idOf = (n: number) => `0192f1a2-3b4c-7d5e-8f60-${String(n).padStart(12, '0')}`;
const session = (n: number, overrides: Partial<FocusSession> = {}) =>
  makeSessionResult({ id: idOf(n), ...overrides });

function launch(storage = memoryStorage()) {
  const issues: StorageIssue[] = [];
  const receipts = new CompletionReceipts({ storage, report: (issue) => issues.push(issue) });
  return { receipts, storage, issues };
}

const storedIds = (storage: ReturnType<typeof memoryStorage>, userId = ADA) => {
  const raw = storage.data.get(completionReceiptsKey(userId));
  return raw === undefined
    ? null
    : (JSON.parse(raw) as { receipts: FocusSession[] }).receipts.map((r) => r.id);
};

describe('CompletionReceipts', () => {
  it('keeps a confirmed session through a kill and relaunch', async () => {
    const first = launch();
    await first.receipts.activate(ADA);
    const answer = session(1, { status: 'completed', counted: true });

    expect(await first.receipts.keep(ADA, answer)).toBe(true);
    expect(receiptFor(first.receipts.getSnapshot(), idOf(1))).toEqual(answer);

    const relaunched = launch(first.storage);
    await relaunched.receipts.activate(ADA);
    expect(receiptFor(relaunched.receipts.getSnapshot(), idOf(1))).toEqual(answer);
  });

  it('replaces a receipt with a newer answer for the same session, never duplicating it', async () => {
    const app = launch();
    await app.receipts.activate(ADA);
    await app.receipts.keep(ADA, session(1));
    await app.receipts.keep(ADA, session(2));

    expect(await app.receipts.keep(ADA, session(1, { note: 'Chapter 4' }))).toBe(true);

    expect(storedIds(app.storage)).toEqual([idOf(1), idOf(2)]);
    expect(receiptFor(app.receipts.getSnapshot(), idOf(1))?.note).toBe('Chapter 4');
  });

  it(`keeps at most ${COMPLETION_RECEIPTS_MAX}: the oldest leaves when another arrives`, async () => {
    const app = launch();
    await app.receipts.activate(ADA);
    for (let n = 1; n <= 20; n += 1) await app.receipts.keep(ADA, session(n));
    expect(storedIds(app.storage)).toHaveLength(20);

    await app.receipts.keep(ADA, session(21));

    const ids = storedIds(app.storage);
    expect(ids).toHaveLength(20);
    expect(ids).not.toContain(idOf(1));
    expect(ids?.[19]).toBe(idOf(21));
    expect(receiptFor(app.receipts.getSnapshot(), idOf(1))).toBeNull();
    expect(receiptFor(app.receipts.getSnapshot(), idOf(21))).not.toBeNull();
  });

  it('touches nothing but its own key when it evicts', async () => {
    const storage = memoryStorage({
      'focus-forest/session-outbox/v1/x': '{"kept":true}',
      'focus-forest/session-notes/v1/x': '{"kept":true}',
    });
    const app = launch(storage);
    await app.receipts.activate(ADA);
    for (let n = 1; n <= 25; n += 1) await app.receipts.keep(ADA, session(n));

    expect(storage.data.get('focus-forest/session-outbox/v1/x')).toBe('{"kept":true}');
    expect(storage.data.get('focus-forest/session-notes/v1/x')).toBe('{"kept":true}');
    expect([...storage.data.keys()].filter((key) => key.includes('receipts'))).toEqual([
      completionReceiptsKey(ADA),
    ]);
  });

  it("never shows one user's receipts to another, and keeps them through sign-out", async () => {
    const app = launch();
    await app.receipts.activate(ADA);
    await app.receipts.keep(ADA, session(1));

    app.receipts.deactivate();
    expect(receiptFor(app.receipts.getSnapshot(), idOf(1))).toBeNull();

    await app.receipts.activate(BEA);
    expect(receiptFor(app.receipts.getSnapshot(), idOf(1))).toBeNull();
    // A late keep for Ada while Bea is signed in stores nothing for either.
    expect(await app.receipts.keep(ADA, session(2))).toBe(false);
    expect(storedIds(app.storage, BEA)).toBeNull();

    await app.receipts.activate(ADA);
    expect(receiptFor(app.receipts.getSnapshot(), idOf(1))).not.toBeNull();
    expect(storedIds(app.storage)).toEqual([idOf(1)]);
  });

  it('waits for the read before keeping, so an early answer never overwrites what is stored', async () => {
    const app = launch();
    await app.receipts.activate(ADA);
    await app.receipts.keep(ADA, session(1));

    const relaunched = launch(app.storage);
    const reading = relaunched.receipts.activate(ADA);
    const kept = relaunched.receipts.keep(ADA, session(2));
    await reading;

    expect(await kept).toBe(true);
    expect(storedIds(app.storage)).toEqual([idOf(1), idOf(2)]);
  });

  it('answers false and shows nothing when the write fails', async () => {
    const app = launch();
    await app.receipts.activate(ADA);
    app.storage.failing.setItem = true;

    expect(await app.receipts.keep(ADA, session(1))).toBe(false);
    expect(receiptFor(app.receipts.getSnapshot(), idOf(1))).toBeNull();
    expect(app.issues).toEqual([{ code: 'write_failed' }]);
  });

  it.each([
    ['not JSON', '{'],
    ['an unknown version', JSON.stringify({ version: 2, receipts: [] })],
    ['a session the schema refuses', JSON.stringify({ version: 1, receipts: [{ id: 'x' }] })],
    ['one session twice', JSON.stringify({ version: 1, receipts: [session(1), session(1)] })],
    [
      'more than the bound',
      JSON.stringify({ version: 1, receipts: Array.from({ length: 21 }, (_, i) => session(i)) }),
    ],
  ])('moves %s aside before removing it, and exposes no session', async (_, raw) => {
    const storage = memoryStorage({ [completionReceiptsKey(ADA)]: raw });
    const app = launch(storage);

    const snapshot = await app.receipts.activate(ADA);

    expect(snapshot.status).toBe('ready');
    expect(snapshot.receipts).toEqual([]);
    expect(storage.data.get(quarantineKeyOf(completionReceiptsKey(ADA)))).toBe(raw);
    expect(storage.data.has(completionReceiptsKey(ADA))).toBe(false);
    // Still usable: the next confirmed session is kept.
    expect(await app.receipts.keep(ADA, session(3))).toBe(true);
  });

  it('never puts a stored session in a report', async () => {
    const secret = session(1, { note: 'my private note' });
    const storage = memoryStorage({
      [completionReceiptsKey(ADA)]: JSON.stringify({ version: 1, receipts: [secret, secret] }),
    });
    const app = launch(storage);
    await app.receipts.activate(ADA);

    expect(JSON.stringify(app.issues)).not.toContain('private');
    expect(app.issues).toEqual([{ code: 'invalid_state' }]);
  });
});
