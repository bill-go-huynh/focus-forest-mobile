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
    seed: 2_654_435_761,
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

describe('idlePlan, the rest of docs/04 §5 (ART.7)', () => {
  it('sways each foliage layer on its own rhythm: back least, front most (parallax)', () => {
    const plan = idle()!;
    expect(plan.backDegrees).toBeGreaterThan(0);
    expect(plan.backDegrees).toBeLessThan(plan.mainDegrees);
    expect(plan.mainDegrees).toBeLessThan(plan.frontDegrees);
    const cycles = [plan.backCycleMs, plan.mainCycleMs, plan.foliageCycleMs];
    expect(new Set(cycles).size).toBe(3);
    for (const cycle of cycles) {
      expect(cycle).toBeGreaterThanOrEqual(3000);
      expect(cycle).toBeLessThanOrEqual(10000);
    }
  });

  it('sends an occasional gentle gust, every 15–40 s, the same rhythm for the same tree', () => {
    const plan = idle()!;
    expect(plan.gusts).not.toBeNull();
    expect(plan.gusts!.intervalsMs.length).toBeGreaterThanOrEqual(4);
    for (const ms of plan.gusts!.intervalsMs) {
      expect(ms).toBeGreaterThanOrEqual(15000);
      expect(ms).toBeLessThanOrEqual(40000);
    }
    expect(new Set(plan.gusts!.intervalsMs).size).toBeGreaterThan(1);
    expect(plan.gusts!.degrees).toBeLessThanOrEqual(2.5);
    expect(idle()!.gusts).toEqual(plan.gusts);
    expect(idle({ seed: 7 })!.gusts!.intervalsMs).not.toEqual(plan.gusts!.intervalsMs);
  });

  it('drifts the light very slowly, by a little', () => {
    const { light } = idle()!;
    expect(light).not.toBeNull();
    expect(light!.cycleMs).toBeGreaterThanOrEqual(20000);
    expect(light!.cycleMs).toBeLessThanOrEqual(60000);
    expect(light!.amount).toBeGreaterThan(0);
    expect(light!.amount).toBeLessThanOrEqual(0.3);
  });

  it('lets fireflies glow softly and each particle drift on its own phase', () => {
    const plan = idle()!;
    expect(plan.twinkleCycleMs).toBeGreaterThanOrEqual(2500);
    expect(plan.twinkleCycleMs).toBeLessThanOrEqual(6000);
  });

  it('keeps a calm scene to the slow canopy sway alone (forest, docs/04 §7)', () => {
    const calm = idle({ motion: 'calm' })!;
    expect(calm.backDegrees).toBe(0);
    expect(calm.mainDegrees).toBe(0);
    expect(calm.gusts).toBeNull();
    expect(calm.light).toBeNull();
  });

  it('is livelier for a thriving tree, and a quiet tree gets no gusts', () => {
    expect(idle({ ambient: ambientFor('quiet') })!.gusts).toBeNull();
    expect(idle({ ambient: ambientFor('thriving') })!.gusts!.degrees).toBeGreaterThan(
      idle({ ambient: ambientFor('stable') })!.gusts!.degrees,
    );
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
