import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '../../test-utils/render';
import { treeDto, type TreeFixtureOptions } from '../../test-utils/trees';
import { environmentFrom } from '../environment';
import { TreeScene } from '../TreeScene';
import { toTreeVisualState } from '../visual-state';

const hidden = { includeHiddenElements: true } as const;
const visual = (options: TreeFixtureOptions = {}) => toTreeVisualState(treeDto(options));
const cosmetic = (id: string, type: string) => ({
  id,
  name: id,
  description: '',
  type,
  rarity: 'common',
  artworkId: id,
});
const EMPTY_FOREST = {
  background: null,
  decoration: null,
  fauna: null,
  weather: null,
  effect: null,
};

describe('environmentFrom: the equipped garden, as the renderer draws it (A4.3)', () => {
  it('takes the background and decoration the server says are equipped', () => {
    expect(
      environmentFrom({
        forest: {
          ...EMPTY_FOREST,
          background: cosmetic('misty-hills', 'background'),
          decoration: cosmetic('stone-lantern', 'decoration'),
        },
        profileFrame: cosmetic('twig-frame', 'profile_frame'),
      }),
    ).toEqual({ background: 'misty-hills', decoration: 'stone-lantern' });
  });

  it('is the base environment when nothing is equipped or the answer is not known', () => {
    expect(environmentFrom({ forest: EMPTY_FOREST, profileFrame: null })).toEqual({
      background: null,
      decoration: null,
    });
    expect(environmentFrom(undefined)).toEqual({ background: null, decoration: null });
  });
});

describe('TreeScene environment: cosmetics decorate the garden, never the tree (docs/03 §10)', () => {
  const garden = { background: 'misty-hills', decoration: 'stone-lantern' } as const;

  it('draws the equipped background and decoration around a growing tree', () => {
    renderWithProviders(<TreeScene tree={visual()} environment={garden} />);
    expect(screen.getByTestId('scene-background-misty-hills', hidden)).toBeTruthy();
    expect(screen.getByTestId('scene-decoration-stone-lantern', hidden)).toBeTruthy();
  });

  it('draws mossy stones as a decoration too', () => {
    renderWithProviders(
      <TreeScene tree={visual()} environment={{ background: null, decoration: 'mossy-stones' }} />,
    );
    expect(screen.getByTestId('scene-decoration-mossy-stones', hidden)).toBeTruthy();
  });

  it('draws only the base environment without equipment', () => {
    renderWithProviders(<TreeScene tree={visual()} />);
    expect(screen.queryByTestId(/^scene-(background|decoration)-/, hidden)).toBeNull();
  });

  it('never puts cosmetics on an archived tree’s scene: it stays an honest record', () => {
    renderWithProviders(<TreeScene tree={visual({ status: 'archived' })} environment={garden} />);
    expect(screen.queryByTestId(/^scene-(background|decoration)-/, hidden)).toBeNull();
  });

  it('draws nothing for a cosmetic it does not know', () => {
    renderWithProviders(
      <TreeScene tree={visual()} environment={{ background: 'aurora', decoration: 'bench' }} />,
    );
    expect(screen.queryByTestId(/^scene-(background|decoration)-/, hidden)).toBeNull();
  });

  it('keeps the scene one described image whatever the garden', () => {
    renderWithProviders(<TreeScene tree={visual()} environment={garden} />);
    expect(screen.getAllByRole('image')).toHaveLength(1);
  });
});

describe('rare species effects: presentation only, and off where they cannot be seen', () => {
  it('draws a rare variant’s effect at hero size, never in a forest thumbnail', () => {
    const golden = visual({ stage: 'final_form', species: 'golden-sakura' });
    const { unmount } = renderWithProviders(<TreeScene tree={golden} />);
    expect(screen.getByTestId('tree-effect-golden-light', hidden)).toBeTruthy();
    unmount();
    renderWithProviders(<TreeScene tree={golden} size="thumbnail" />);
    expect(screen.queryByTestId('tree-effect-golden-light', hidden)).toBeNull();
  });

  it('draws no effect for a species without one', () => {
    renderWithProviders(<TreeScene tree={visual({ stage: 'final_form', species: 'sakura' })} />);
    expect(screen.queryByTestId(/^tree-effect-/, hidden)).toBeNull();
  });
});
