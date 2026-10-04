import { treeDto, type TreeFixtureOptions } from '../../test-utils/trees';
import { composeTree } from '../composition';
import {
  AMBIENCES,
  ambientFor,
  particlesFor,
  sceneColors,
  sceneLighting,
  TIMES_OF_DAY,
  timeOfDayAt,
  type Ambience,
} from '../scene';
import { toTreeVisualState } from '../visual-state';

const compose = (options: TreeFixtureOptions = {}) =>
  composeTree(toTreeVisualState(treeDto(options)));

/** Hue in degrees and lightness 0–1 of a #rrggbb color. */
function hsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };
  const d = max - min;
  const saturation = d / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  return { hue: hue < 0 ? hue + 360 : hue, saturation, lightness };
}

describe('ambient presentation by vitality', () => {
  const energy = (ambience: Ambience) => ambientFor(ambience);

  it('makes a thriving tree the liveliest and a quiet one almost still', () => {
    expect(energy('thriving').sway).toBeGreaterThan(energy('healthy').sway);
    expect(energy('healthy').sway).toBeGreaterThan(energy('stable').sway);
    expect(energy('stable').sway).toBeGreaterThan(energy('quiet').sway);
    expect(energy('thriving').pollen).toBeGreaterThan(energy('stable').pollen);
    expect(energy('quiet').pollen).toBe(0);
    expect(energy('thriving').warmth).toBeGreaterThan(energy('quiet').warmth);
  });

  it('gives a recovering tree a warm, waking response', () => {
    expect(energy('recovering').warmth).toBeGreaterThan(energy('stable').warmth);
    expect(energy('recovering').sway).toBeGreaterThan(energy('quiet').sway);
  });

  it('keeps an archived tree gently alive and neutral', () => {
    const rest = energy('at_rest');
    expect(rest.sway).toBeGreaterThan(energy('quiet').sway);
    expect(rest.sway).toBeLessThan(energy('thriving').sway);
    expect(rest.warmth).toBeGreaterThan(energy('quiet').warmth);
    expect(rest.saturation).toBe(1);
  });

  it.each(AMBIENCES)('%s keeps saturation in a small, safe range', (ambience) => {
    expect(energy(ambience).saturation).toBeGreaterThanOrEqual(0.9);
    expect(energy(ambience).saturation).toBeLessThanOrEqual(1);
    expect(Object.keys(energy(ambience)).sort()).toEqual([
      'pollen',
      'saturation',
      'sway',
      'warmth',
    ]);
  });
});

describe('time of day', () => {
  it.each([
    [5, 'dawn'],
    [7, 'dawn'],
    [8, 'day'],
    [16, 'day'],
    [17, 'golden_hour'],
    [18, 'golden_hour'],
    [19, 'dusk'],
    [20, 'dusk'],
    [21, 'night'],
    [0, 'night'],
    [4, 'night'],
  ] as const)('%i:30 local time is %s', (hour, expected) => {
    expect(timeOfDayAt(new Date(2026, 9, 4, hour, 30))).toBe(expected);
  });

  it.each(TIMES_OF_DAY)('%s has a complete lighting preset', (timeOfDay) => {
    const lighting = sceneLighting(timeOfDay);
    for (const color of [...lighting.sky, lighting.hills, lighting.ground, lighting.light.color]) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(lighting.light.opacity).toBeGreaterThanOrEqual(0);
    expect(lighting.light.opacity).toBeLessThanOrEqual(0.25);
  });
});

describe('scene colors', () => {
  it('never turns the foliage brown, grey, or dead-looking', () => {
    for (let seed = 0; seed < 6; seed += 1) {
      const composition = compose({ seed, stage: 'final_form', richness: 3 });
      for (const ambience of AMBIENCES) {
        for (const timeOfDay of TIMES_OF_DAY) {
          const colors = sceneColors(composition, ambientFor(ambience), sceneLighting(timeOfDay));
          const { back, main, front, accent } = colors.foliage;
          for (const leaf of [back, main, front, accent]) {
            const { hue, saturation } = hsl(leaf);
            expect(hue).toBeGreaterThanOrEqual(70);
            expect(hue).toBeLessThanOrEqual(185);
            expect(saturation).toBeGreaterThan(0.15);
          }
        }
      }
    }
  });

  it('changes only the light, never the tree, between quiet and thriving', () => {
    const composition = compose();
    const lighting = sceneLighting('day');
    const quiet = sceneColors(composition, ambientFor('quiet'), lighting);
    const thriving = sceneColors(composition, ambientFor('thriving'), lighting);
    expect(quiet.light.opacity).toBeLessThan(thriving.light.opacity);
    expect(quiet.blossom).toBe(thriving.blossom);
    expect(quiet.fruit).toBe(thriving.fruit);
    expect(quiet.bark).toBe(thriving.bark);
  });
});

describe('particles', () => {
  it('drifts pollen by day as vitality allows, none at night', () => {
    const composition = compose();
    const day = sceneLighting('day');
    expect(particlesFor(composition, ambientFor('thriving'), day).length).toBe(
      ambientFor('thriving').pollen,
    );
    expect(particlesFor(composition, ambientFor('quiet'), day)).toEqual([]);
    expect(particlesFor(composition, ambientFor('thriving'), sceneLighting('night'))).toEqual([]);
  });

  it('shows fireflies at night only on a tree at the top richness tier, whatever vitality', () => {
    const rich = compose({ stage: 'final_form', richness: 5 });
    const night = sceneLighting('night');
    const fireflies = particlesFor(rich, ambientFor('quiet'), night);
    expect(fireflies.length).toBeGreaterThan(0);
    expect(fireflies.every((particle) => particle.kind === 'firefly')).toBe(true);
    expect(
      particlesFor(compose({ stage: 'final_form', richness: 4 }), ambientFor('quiet'), night),
    ).toEqual([]);
  });

  it('places particles at authored slots, the same every time', () => {
    const composition = compose({ seed: 5 });
    const day = sceneLighting('day');
    expect(particlesFor(composition, ambientFor('healthy'), day)).toEqual(
      particlesFor(composition, ambientFor('healthy'), day),
    );
  });
});
