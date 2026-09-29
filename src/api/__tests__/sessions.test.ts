import { fakeFetch, makeSession, memoryTokenStore, nestError, NOW } from '../../test-utils/api';
import { makeSessionResult, makeSubmissionBody } from '../../test-utils/sessions';
import { createApi } from '../api';
import { HttpError, InvalidResponseError, NetworkError } from '../errors';
import {
  sessionErrorCode,
  sessionSchema,
  sessionSubmissionBodySchema,
  submitSession,
  updateSessionNote,
} from '../sessions';

const ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const BODY = makeSubmissionBody();
const RESULT = makeSessionResult({ id: ID });

async function setup(handler: Parameters<typeof fakeFetch>[0]) {
  const net = fakeFetch(handler);
  const api = createApi({
    baseUrl: 'https://api.example.com',
    fetch: net.fetch,
    store: memoryTokenStore(makeSession()),
    now: () => NOW,
  });
  await api.session.restore();
  return { ...net, api };
}

const coded = (status: number, code: string) => ({
  status,
  body: { statusCode: status, message: 'Whatever the text.', code },
});

describe('sessionSchema (the A2.5 session response)', () => {
  it('accepts a full session', () => {
    expect(sessionSchema.parse(RESULT)).toEqual(RESULT);
  });

  it('accepts every status, and a note', () => {
    for (const status of ['completed', 'ended_early', 'discarded'] as const) {
      const session = { ...RESULT, status, counted: status !== 'discarded', note: 'Calm.' };
      expect(sessionSchema.parse(session)).toEqual(session);
    }
  });

  it.each([
    ['an uppercase id', { id: ID.toUpperCase() }],
    ['a topic id that is not a UUID', { topicId: 'topic-1' }],
    ['an unknown status', { status: 'abandoned' }],
    ['a malformed end', { endedAt: '2026-09-27' }],
    ['fractional focused time', { focusedMilliseconds: 1.5 }],
    ['negative paused time', { pausedMilliseconds: -1 }],
    ['planned minutes past the bound', { plannedMinutes: 1441 }],
    ['a local date with a time', { localDate: '2026-09-27T00:00:00Z' }],
    ['month 13', { month: 13 }],
    ['counted as text', { counted: 'true' }],
    ['a missing field', { createdAt: undefined }],
    ['a discarded session that counts', { status: 'discarded', counted: true }],
    ['a completed session that does not count', { status: 'completed', counted: false }],
  ])('rejects %s', (_case, change) => {
    expect(sessionSchema.safeParse({ ...RESULT, ...change }).success).toBe(false);
  });
});

describe('sessionSubmissionBodySchema (what the outbox stores and sends)', () => {
  it('accepts what toSubmission builds', () => {
    expect(sessionSubmissionBodySchema.parse(BODY)).toEqual(BODY);
  });

  it('accepts a session that ended the moment it started, and touching pauses', () => {
    const body = makeSubmissionBody({
      startedAt: '2026-09-27T10:00:00.000Z',
      endedAt: '2026-09-27T10:20:00.000Z',
      pauseIntervals: [
        { startedAt: '2026-09-27T10:05:00.000Z', endedAt: '2026-09-27T10:06:00.000Z' },
        { startedAt: '2026-09-27T10:06:00.000Z', endedAt: '2026-09-27T10:20:00.000Z' },
      ],
    });
    expect(sessionSubmissionBodySchema.safeParse(body).success).toBe(true);
    const instant = makeSubmissionBody({ endedAt: BODY.startedAt, pauseIntervals: [] });
    expect(sessionSubmissionBodySchema.safeParse(instant).success).toBe(true);
  });

  const pause = (startedAt: string, endedAt: string) => ({
    startedAt: `2026-09-27T${startedAt}:00.000Z`,
    endedAt: `2026-09-27T${endedAt}:00.000Z`,
  });

  it.each([
    ['an uppercase topic id', { topicId: BODY.topicId.toUpperCase() }],
    ['a topic id that is not a UUID', { topicId: 'topic-1' }],
    ['a time with an offset instead of UTC', { startedAt: '2026-09-27T17:00:00.000+07:00' }],
    ['a time without milliseconds', { startedAt: '2026-09-27T10:00:00Z' }],
    ['a date that does not exist', { startedAt: '2026-02-30T10:00:00.000Z' }],
    ['zero planned minutes', { plannedMinutes: 0 }],
    ['planned minutes past 1440', { plannedMinutes: 1441 }],
    ['fractional planned minutes', { plannedMinutes: 25.5 }],
    ['an end before the start', { endedAt: '2026-09-27T09:59:59.999Z' }],
    ['a pause that ends before it starts', { pauseIntervals: [pause('10:06', '10:05')] }],
    ['a pause before the session', { pauseIntervals: [pause('09:59', '10:05')] }],
    ['a pause after the end', { pauseIntervals: [pause('10:20', '10:26')] }],
    ['pauses out of order', { pauseIntervals: [pause('10:10', '10:11'), pause('10:05', '10:06')] }],
    ['overlapping pauses', { pauseIntervals: [pause('10:05', '10:08'), pause('10:07', '10:09')] }],
    ['an extra field', { focusedMilliseconds: 1 }],
    ['a missing field', { pauseIntervals: undefined }],
    ['an extra pause field', { pauseIntervals: [{ ...pause('10:05', '10:06'), note: 'x' }] }],
  ])('rejects %s', (_case, change) => {
    expect(sessionSubmissionBodySchema.safeParse({ ...BODY, ...change }).success).toBe(false);
  });
});

describe('submitSession (PUT /me/sessions/:id)', () => {
  it('sends exactly the raw submission to the id path and answers the validated session', async () => {
    const { api, requests } = await setup(() => ({ status: 201, body: RESULT }));

    await expect(submitSession(api.client, ID, BODY)).resolves.toEqual(RESULT);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: `https://api.example.com/me/sessions/${ID}`,
      method: 'PUT',
      body: BODY,
    });
  });

  it('answers a replay (200) the same way', async () => {
    const { api } = await setup(() => ({ status: 200, body: RESULT }));
    await expect(submitSession(api.client, ID, BODY)).resolves.toEqual(RESULT);
  });

  it('refuses a response that breaks the contract', async () => {
    const { api } = await setup(() => ({ status: 201, body: { ...RESULT, status: 'maybe' } }));
    await expect(submitSession(api.client, ID, BODY)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('passes errors on with their status and code', async () => {
    const { api } = await setup(() => coded(422, 'ends_in_future'));
    const error = await submitSession(api.client, ID, BODY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 422, code: 'ends_in_future' });
  });

  it('reports an unreachable server as a network error', async () => {
    const { api } = await setup(() => new NetworkError());
    await expect(submitSession(api.client, ID, BODY)).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('sessionErrorCode', () => {
  it.each([
    [coded(409, 'session_overlap'), 'session_overlap'],
    [coded(409, 'session_id_conflict'), 'session_id_conflict'],
    [coded(422, 'ends_in_future'), 'ends_in_future'],
    [coded(422, 'timezone_required'), 'timezone_required'],
    [coded(422, 'pauses_overlap'), 'pauses_overlap'],
    [coded(422, 'invalid_time'), 'invalid_time'],
  ])('reads a known code', (reply, code) => {
    expect(sessionErrorCode(new HttpError(reply.status, reply.body))).toBe(code);
  });

  it('ignores unknown codes, codes on other statuses, and other errors', () => {
    expect(sessionErrorCode(new HttpError(409, coded(409, 'topic_name_taken').body))).toBeNull();
    expect(sessionErrorCode(new HttpError(500, coded(500, 'session_overlap').body))).toBeNull();
    expect(sessionErrorCode(new HttpError(422, nestError(422, 'x')))).toBeNull();
    expect(sessionErrorCode(new NetworkError())).toBeNull();
  });
});

describe('updateSessionNote (PATCH /me/sessions/:id/note)', () => {
  it('sends only the note to the note path and answers the validated session', async () => {
    const answer = makeSessionResult({ id: ID, note: 'Chapter 4' });
    const { api, requests } = await setup(() => ({ status: 200, body: answer }));

    await expect(updateSessionNote(api.client, ID, 'Chapter 4')).resolves.toEqual(answer);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: `https://api.example.com/me/sessions/${ID}/note`,
      method: 'PATCH',
      body: { note: 'Chapter 4' },
    });
  });

  it('clears with an explicit null', async () => {
    const { api, requests } = await setup(() => ({ status: 200, body: RESULT }));
    await updateSessionNote(api.client, ID, null);
    expect(requests[0]!.body).toEqual({ note: null });
  });

  it('refuses a response that breaks the contract', async () => {
    const { api } = await setup(() => ({ status: 200, body: { ...RESULT, note: 4 } }));
    await expect(updateSessionNote(api.client, ID, 'x')).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it('passes a 404 on as an HttpError', async () => {
    const { api } = await setup(() => ({
      status: 404,
      body: nestError(404, 'Session not found.'),
    }));
    await expect(updateSessionNote(api.client, ID, 'x')).rejects.toMatchObject({ status: 404 });
  });
});
