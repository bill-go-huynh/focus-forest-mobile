import { ErrorReporter, type ClientErrorReport } from '../error-reporter';

/**
 * M7.2 Error reports (A7.4, self-built; Phase 7 owner decision 1): sent only while the person
 * shares usage data, held in memory until that is known, never more than twenty, and kept for a
 * later try when the network fails.
 */

const NOW = Date.parse('2026-11-02T10:00:00.000Z');

function setup(fail = false) {
  const sent: ClientErrorReport[][] = [];
  const state = { fail };
  const reporter = new ErrorReporter({
    send: async (reports) => {
      if (state.fail) throw new Error('offline');
      sent.push([...reports]);
    },
    platform: 'ios',
    appVersion: '1.4.0',
    now: () => NOW,
  });
  return { reporter, sent, state };
}

describe('ErrorReporter (M7.2)', () => {
  it('sends what happened once the person shares usage data', async () => {
    const { reporter, sent } = setup();
    reporter.report({ kind: 'crash', message: 'boom', stack: 'at Home', screen: '/' });
    await reporter.idle();
    expect(sent).toEqual([]);
    reporter.setSharing(true);
    await reporter.idle();
    expect(sent).toEqual([
      [
        {
          occurredAt: '2026-11-02T10:00:00.000Z',
          kind: 'crash',
          platform: 'ios',
          appVersion: '1.4.0',
          screen: '/',
          message: 'boom',
          stack: 'at Home',
        },
      ],
    ]);
    reporter.report({ kind: 'error', message: 'later', stack: null, screen: null });
    await reporter.idle();
    expect(sent).toHaveLength(2);
  });

  it('forgets everything when the person does not share usage data', async () => {
    const { reporter, sent } = setup();
    reporter.report({ kind: 'crash', message: 'boom', stack: null, screen: null });
    reporter.setSharing(false);
    reporter.report({ kind: 'crash', message: 'again', stack: null, screen: null });
    reporter.setSharing(true);
    await reporter.idle();
    expect(sent).toEqual([]);
  });

  it('keeps reports for a later try when the network fails, never more than twenty', async () => {
    const { reporter, sent, state } = setup(true);
    reporter.setSharing(true);
    for (let i = 0; i < 25; i += 1) {
      reporter.report({ kind: 'error', message: `e${i}`, stack: null, screen: null });
    }
    await reporter.idle();
    expect(sent).toEqual([]);
    state.fail = false;
    await reporter.flush();
    expect(sent).toHaveLength(1);
    // The newest twenty.
    expect(sent[0]!.map((r) => r.message)).toEqual(
      Array.from({ length: 20 }, (_, i) => `e${i + 5}`),
    );
  });

  it('never sends an empty message, and cuts very long text', async () => {
    const { reporter, sent } = setup();
    reporter.setSharing(true);
    reporter.report({ kind: 'error', message: '', stack: null, screen: null });
    reporter.report({
      kind: 'error',
      message: 'x'.repeat(6000),
      stack: 'y'.repeat(30_000),
      screen: null,
    });
    await reporter.idle();
    const all = sent.flat();
    expect(all[0]!.message).toBe('(no message)');
    expect(all[1]!.message).toHaveLength(5000);
    expect(all[1]!.stack).toHaveLength(20_000);
  });
});
