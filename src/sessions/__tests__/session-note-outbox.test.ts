import {
  HttpError,
  InvalidResponseError,
  NetworkError,
  UnauthenticatedError,
} from '../../api/errors';
import type { FocusSession } from '../../api/sessions';
import { makeSessionResult } from '../../test-utils/sessions';
import { memoryStorage } from '../../test-utils/storage';
import { quarantineKeyOf } from '../../common/stored-json';
import { sessionNoteOutboxKey, SessionNoteOutbox } from '../session-note-outbox';

const ADA = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const S1 = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const S2 = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c7';

function setup(storage = memoryStorage()) {
  /** Sessions the server has confirmed (absent from the session outbox), per user. */
  const confirmed = new Set<string>();
  const state = {
    known: true,
    reply: null as ((id: string, note: string | null) => unknown) | null,
    /** Whether the next receipts can be stored. */
    receipts: true,
  };
  const receipts: { userId: string; session: FocusSession }[] = [];
  const sent: { id: string; note: string | null }[] = [];
  const server = new Map<string, string | null>();
  const report = jest.fn();
  const notes = new SessionNoteOutbox({
    storage,
    now: () => 1_000,
    report,
    isSessionConfirmed: (userId, id) => (state.known ? confirmed.has(`${userId}:${id}`) : null),
    send: async (id, note): Promise<FocusSession> => {
      sent.push({ id, note });
      const reply = state.reply?.(id, note);
      if (reply instanceof Error) throw reply;
      server.set(id, note);
      return makeSessionResult({ id, note });
    },
    keepReceipt: async (userId, session) => {
      if (!state.receipts) return false;
      receipts.push({ userId, session });
      return true;
    },
  });
  const confirm = (userId: string, id: string) => confirmed.add(`${userId}:${id}`);
  return { notes, storage, state, sent, server, report, confirm, receipts };
}

const stored = (storage: ReturnType<typeof memoryStorage>, userId = ADA) =>
  JSON.parse(storage.data.get(sessionNoteOutboxKey(userId)) ?? 'null');

describe('SessionNoteOutbox', () => {
  it('stores the note canonical, before anything is sent', async () => {
    const app = setup();
    await app.notes.activate(ADA);

    expect(await app.notes.save(ADA, S1, '  café notes  ')).toEqual({ ok: true });

    expect(stored(app.storage).items).toEqual([
      expect.objectContaining({ sessionId: S1, note: 'café notes', state: 'pending' }),
    ]);
    expect(app.sent).toEqual([]);
  });

  it('refuses a note over 500 characters and stores nothing', async () => {
    const app = setup();
    await app.notes.activate(ADA);

    expect(await app.notes.save(ADA, S1, 'a'.repeat(501))).toEqual({
      ok: false,
      reason: 'invalid_note',
    });
    expect(app.storage.data.has(sessionNoteOutboxKey(ADA))).toBe(false);
  });

  it('never sends a note before the server has confirmed its session', async () => {
    const app = setup();
    await app.notes.activate(ADA);
    await app.notes.save(ADA, S1, 'Chapter 4');

    await app.notes.flush();
    expect(app.sent).toEqual([]);

    app.state.known = false;
    app.confirm(ADA, S1);
    await app.notes.flush();
    expect(app.sent).toEqual([]);

    app.state.known = true;
    await app.notes.flush();
    expect(app.sent).toEqual([{ id: S1, note: 'Chapter 4' }]);
    expect(stored(app.storage).items).toEqual([]);
    expect(app.notes.getSnapshot().confirmed[S1]?.note).toBe('Chapter 4');
  });

  it('keeps the note through a kill and sends it after the relaunch', async () => {
    const storage = memoryStorage();
    const first = setup(storage);
    await first.notes.activate(ADA);
    await first.notes.save(ADA, S1, 'Chapter 4');

    const again = setup(storage);
    again.confirm(ADA, S1);
    await again.notes.activate(ADA);
    await again.notes.flush();

    expect(again.sent).toEqual([{ id: S1, note: 'Chapter 4' }]);
  });

  it('sends the same note again when an answer was lost, then clears it', async () => {
    const app = setup();
    await app.notes.activate(ADA);
    app.confirm(ADA, S1);
    await app.notes.save(ADA, S1, 'Chapter 4');
    let calls = 0;
    app.state.reply = () => (++calls === 1 ? new NetworkError() : null);

    await app.notes.flush();
    expect(stored(app.storage).items).toHaveLength(1);

    await app.notes.flush();
    expect(app.sent).toEqual([
      { id: S1, note: 'Chapter 4' },
      { id: S1, note: 'Chapter 4' },
    ]);
    expect(stored(app.storage).items).toEqual([]);
  });

  it.each([
    ['a 5xx', new HttpError(503, {})],
    ['a 404 (not observable yet)', new HttpError(404, {})],
    ['a 401', new UnauthenticatedError()],
    ['no connection', new NetworkError()],
  ])('keeps the note to retry after %s', async (_case, error) => {
    const app = setup();
    await app.notes.activate(ADA);
    app.confirm(ADA, S1);
    await app.notes.save(ADA, S1, 'Chapter 4');
    app.state.reply = () => error;

    await app.notes.flush();

    expect(stored(app.storage).items).toEqual([
      expect.objectContaining({ sessionId: S1, note: 'Chapter 4', state: 'pending' }),
    ]);
  });

  it.each([
    ['a refusal (400)', new HttpError(400, {}), 'rejected'],
    ['a malformed answer', new InvalidResponseError('bad'), 'invalid_response'],
  ])('keeps the note for attention after %s, and stops retrying it', async (_c, error, reason) => {
    const app = setup();
    await app.notes.activate(ADA);
    app.confirm(ADA, S1);
    await app.notes.save(ADA, S1, 'Chapter 4');
    app.state.reply = () => error;

    await app.notes.flush();
    await app.notes.flush();

    expect(app.sent).toHaveLength(1);
    expect(stored(app.storage).items).toEqual([
      expect.objectContaining({ note: 'Chapter 4', state: 'needs_attention', reason }),
    ]);
  });

  it('keeps an edit made while the earlier note was being sent, and sends it next', async () => {
    const app = setup();
    await app.notes.activate(ADA);
    app.confirm(ADA, S1);
    await app.notes.save(ADA, S1, 'first');
    let edit: Promise<unknown> = Promise.resolve();
    app.state.reply = (_id, note) => {
      if (note === 'first') edit = app.notes.save(ADA, S1, 'second');
      return null;
    };

    await app.notes.flush();
    await edit;
    expect(stored(app.storage).items).toEqual([expect.objectContaining({ note: 'second' })]);

    await app.notes.flush();
    expect(app.server.get(S1)).toBe('second');
    expect(stored(app.storage).items).toEqual([]);
  });

  it('clears a note with null, and replaces a queued one', async () => {
    const app = setup();
    await app.notes.activate(ADA);
    await app.notes.save(ADA, S1, 'first');
    await app.notes.save(ADA, S1, '   ');

    expect(stored(app.storage).items).toEqual([expect.objectContaining({ note: null })]);
    app.confirm(ADA, S1);
    await app.notes.flush();
    expect(app.sent).toEqual([{ id: S1, note: null }]);
  });

  it("keeps each user's notes apart, through sign-out", async () => {
    const storage = memoryStorage();
    const app = setup(storage);
    await app.notes.activate(ADA);
    await app.notes.save(ADA, S1, "Ada's");
    app.notes.deactivate();

    await app.notes.activate(BEA);
    app.confirm(BEA, S1);
    expect(app.notes.getSnapshot().items).toEqual([]);
    expect(await app.notes.save(ADA, S2, 'not now')).toEqual({ ok: false, reason: 'not_ready' });
    await app.notes.flush();
    expect(app.sent).toEqual([]);

    app.notes.deactivate();
    app.confirm(ADA, S1);
    await app.notes.activate(ADA);
    await app.notes.flush();
    expect(app.sent).toEqual([{ id: S1, note: "Ada's" }]);
  });

  it('moves a corrupt queue aside instead of sending it, and starts empty', async () => {
    const storage = memoryStorage({
      [sessionNoteOutboxKey(ADA)]: '{"version":1,"items":[{"x":1}]}',
    });
    const app = setup(storage);

    await app.notes.activate(ADA);

    expect(app.notes.getSnapshot()).toMatchObject({ status: 'ready', items: [] });
    expect(storage.data.get(quarantineKeyOf(sessionNoteOutboxKey(ADA)))).toContain('"x":1');
    await app.notes.flush();
    expect(app.sent).toEqual([]);
  });

  it('keeps the note in memory unchanged when it cannot be stored', async () => {
    const app = setup();
    await app.notes.activate(ADA);
    app.storage.failing.setItem = true;

    expect(await app.notes.save(ADA, S1, 'x')).toEqual({ ok: false, reason: 'storage_failed' });
    expect(app.notes.getSnapshot().items).toEqual([]);
  });
});

describe('the completion receipt after a note is confirmed', () => {
  it("keeps the server's answer, note included, before the note leaves the queue", async () => {
    const app = setup();
    await app.notes.activate(ADA);
    app.confirm(ADA, S1);
    await app.notes.save(ADA, S1, 'Chapter 4');

    await app.notes.flush();

    expect(app.receipts).toEqual([
      { userId: ADA, session: expect.objectContaining({ id: S1, note: 'Chapter 4' }) },
    ]);
    expect(stored(app.storage).items).toEqual([]);
  });

  it('keeps the note queued when the receipt cannot be stored, and sends it again later', async () => {
    const app = setup();
    await app.notes.activate(ADA);
    app.confirm(ADA, S1);
    await app.notes.save(ADA, S1, 'Chapter 4');
    app.state.receipts = false;

    await app.notes.flush();

    expect(stored(app.storage).items).toEqual([
      expect.objectContaining({ sessionId: S1, note: 'Chapter 4', state: 'pending' }),
    ]);
    expect(app.notes.getSnapshot().confirmed).toEqual({});

    app.state.receipts = true;
    await app.notes.flush();

    expect(app.sent).toEqual([
      { id: S1, note: 'Chapter 4' },
      { id: S1, note: 'Chapter 4' },
    ]);
    expect(stored(app.storage).items).toEqual([]);
    expect(app.receipts).toHaveLength(1);
  });

  it('keeps the answer for an older value too, while the newer edit stays queued', async () => {
    const app = setup();
    await app.notes.activate(ADA);
    app.confirm(ADA, S1);
    await app.notes.save(ADA, S1, 'first');
    let edit: Promise<unknown> = Promise.resolve();
    app.state.reply = () => {
      app.state.reply = null;
      edit = app.notes.save(ADA, S1, 'second');
      return undefined;
    };

    await app.notes.flush();
    await edit;

    expect(app.receipts[0]?.session.note).toBe('first');
    expect(stored(app.storage).items).toEqual([expect.objectContaining({ note: 'second' })]);
  });
});
