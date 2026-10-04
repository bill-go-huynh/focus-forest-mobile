import { lightTheme } from '../../theme';
import { idlePlan, reactionPlan, REACTION_KINDS } from '../motion-plan';
import { ambientFor } from '../scene';

const tokens = lightTheme.motion;
const idle = (overrides: Partial<Parameters<typeof idlePlan>[0]> = {}) =>
  idlePlan({
    motion: 'full',
    reducedMotion: false,
    running: true,
    ambient: ambientFor('healthy'),
    tokens,
    ...overrides,
  });

describe('idlePlan', () => {
  it('sways the canopy and front foliage independently, and drifts particles', () => {
    const plan = idle();
    expect(plan).not.toBeNull();
    expect(plan!.canopyDegrees).toBeGreaterThan(0);
    // Front foliage moves a little more than the canopy, for depth (docs/04 §5).
    expect(plan!.frontDegrees).toBeGreaterThan(plan!.canopyDegrees);
    expect(plan!.canopyCycleMs).toBe(tokens.ambient.sway);
    expect(plan!.foliageCycleMs).toBe(tokens.ambient.foliage);
    expect(plan!.driftCycleMs).toBe(tokens.ambient.drift);
    expect(plan!.driftDistance).toBeGreaterThan(0);
  });

  it('keeps the motion small: a sway, never a bend', () => {
    const plan = idle({ ambient: ambientFor('thriving') })!;
    expect(plan.canopyDegrees).toBeLessThanOrEqual(2);
    expect(plan.frontDegrees).toBeLessThanOrEqual(3);
  });

  it('follows vitality: a quiet tree is almost still, a thriving one livelier', () => {
    const quiet = idle({ ambient: ambientFor('quiet') })!;
    const thriving = idle({ ambient: ambientFor('thriving') })!;
    expect(quiet.canopyDegrees).toBeLessThan(thriving.canopyDegrees);
    expect(quiet.driftDistance).toBeLessThan(thriving.driftDistance);
  });

  it('stops under reduced motion', () => {
    expect(idle({ reducedMotion: true })).toBeNull();
  });

  it('stops while the scene is not running (off screen or app in the background)', () => {
    expect(idle({ running: false })).toBeNull();
  });

  it('stops for a still scene and keeps only a slow canopy sway for a calm one', () => {
    expect(idle({ motion: 'still' })).toBeNull();
    const calm = idle({ motion: 'calm' })!;
    expect(calm.canopyDegrees).toBeGreaterThan(0);
    expect(calm.canopyDegrees).toBeLessThan(idle()!.canopyDegrees);
    expect(calm.frontDegrees).toBe(0);
    expect(calm.driftDistance).toBe(0);
  });
});

describe('reactionPlan', () => {
  const plan = (kind: (typeof REACTION_KINDS)[number], reducedMotion = false, running = true) =>
    reactionPlan(kind, { reducedMotion, running, tokens });

  it('lets a gust pass through the canopy after normal growth', () => {
    expect(plan('growth')).toMatchObject({ gust: true, reveal: 'canopy', crossfade: false });
    expect(plan('growth').durationMs).toBe(tokens.growth);
  });

  it('cross-fades the old stage into the new one', () => {
    expect(plan('stage')).toMatchObject({ gust: true, reveal: 'tree', crossfade: true });
    expect(plan('stage').durationMs).toBe(tokens.growth);
  });

  it('reveals new blossoms and traits in their layer', () => {
    expect(plan('blossoms')).toMatchObject({ reveal: 'blossoms', durationMs: tokens.reward });
    expect(plan('trait')).toMatchObject({ reveal: 'traits', durationMs: tokens.reward });
  });

  it.each(REACTION_KINDS)('%s becomes a short fade under reduced motion', (kind) => {
    const reduced = plan(kind, true);
    expect(reduced.gust).toBe(false);
    expect(reduced.durationMs).toBe(tokens.fast);
    expect(reduced.reveal).toBe(plan(kind).reveal);
  });

  it.each(REACTION_KINDS)(
    '%s shows the final state at once when the scene is not running',
    (kind) => {
      expect(plan(kind, false, false)).toMatchObject({
        gust: false,
        durationMs: 0,
        crossfade: false,
      });
    },
  );
});
