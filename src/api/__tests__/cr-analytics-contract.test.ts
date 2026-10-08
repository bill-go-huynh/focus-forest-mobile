import { AnalyticsQueue, type QueuedEvent } from '../../analytics/analytics-queue';
import request from '../../test-utils/cr/analytics-request.json';
import { memoryStorage } from '../../test-utils/storage';

/**
 * CR.X analytics request parity: the body the app sends to POST /me/analytics/events, built by
 * the real queue, equals `analytics-request.json`, which the API's integration test posts and
 * must accept whole (focus-forest-api test/cr/checkpoint-journey.int-spec.ts; the two copies are
 * byte-identical, compare `shasum -a 256`).
 */
describe('CR.X: the analytics request the app sends is the one the API accepts', () => {
  it('builds exactly the shared request', async () => {
    const ids = request.events.map((event) => event.id);
    const times = request.events.map((event) => event.occurredAt);
    let sent: QueuedEvent[] = [];
    const queue = new AnalyticsQueue({
      storage: memoryStorage(),
      send: async (events) => {
        sent = events;
        return { accepted: events.length, ignored: 0 };
      },
      now: () => new Date(times.shift()!),
      newId: () => ids.shift()!,
      platform: 'ios',
      appVersion: '0.1.0',
      localDateOf: (date) => date.toISOString().slice(0, 10),
    });
    await queue.activate('user-1');
    queue.setSharing(true);
    await queue.record('app_opened');
    await queue.record('focus_started', { plannedMinutes: 25 });
    await queue.record('recap_opened', { year: 2026, month: 8 });
    await queue.flush();
    expect({ events: sent }).toEqual(request);
  });
});
