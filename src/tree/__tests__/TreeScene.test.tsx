import { act, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { AppState, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { Ellipse } from 'react-native-svg';
import type { ReactTestInstance } from 'react-test-renderer';

import { mockAppState } from '../../test-utils/app-state';
import { renderWithProviders } from '../../test-utils/render';
import { treeDto, type TreeFixtureOptions } from '../../test-utils/trees';
import { lightTheme } from '../../theme';
import { describeTree } from '../describe-tree';
import { TreeScene, type TreeSceneHandle } from '../TreeScene';
import { toTreeVisualState } from '../visual-state';

jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    withRepeat: jest.fn(actual.withRepeat),
    withSpring: jest.fn(actual.withSpring),
    cancelAnimation: jest.fn(actual.cancelAnimation),
  };
});

const withRepeat = jest.mocked(Reanimated.withRepeat);
const withSpring = jest.mocked(Reanimated.withSpring);
const cancelAnimation = jest.mocked(Reanimated.cancelAnimation);

const hidden = { includeHiddenElements: true } as const;

const visual = (options: TreeFixtureOptions = {}) => toTreeVisualState(treeDto(options));

const ellipses = () => screen.UNSAFE_root.findAll((node) => node.type === Ellipse);

/** Host elements a screen reader could land on inside the scene. */
function accessibleDescendants(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node !== root &&
      (node.props.accessible === true || node.props.accessibilityLabel !== undefined),
  );
}

beforeEach(() => {
  withRepeat.mockClear();
  withSpring.mockClear();
  cancelAnimation.mockClear();
});

describe('TreeScene', () => {
  it('is one image for screen readers, described from server truth', () => {
    const tree = visual({ stage: 'mature_tree', fullness: 5, blossoms: 3, vitality: 'healthy' });
    renderWithProviders(<TreeScene tree={tree} timeOfDay="day" locale="en-US" />);
    const image = screen.getByRole('image');
    expect(image.props.accessibilityLabel).toBe(describeTree(tree, 'en-US'));
    expect(screen.getAllByRole('image')).toHaveLength(1);
  });

  it('hides every drawn layer from assistive technology', () => {
    renderWithProviders(
      <TreeScene
        tree={visual({ stage: 'final_form', richness: 5, traits: ['streak-days:7'] })}
        timeOfDay="night"
      />,
    );
    const image = screen.getByRole('image');
    expect(accessibleDescendants(image)).toEqual([]);
    // The art is hidden from assistive technology, so it is found only among hidden elements.
    const art = screen.getByTestId('tree-scene-art', { includeHiddenElements: true });
    expect(art.props.accessibilityElementsHidden).toBe(true);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(ellipses().length).toBeGreaterThan(10);
  });

  it('draws without Math.random', () => {
    const random = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not decide how a tree looks.');
    });
    try {
      renderWithProviders(
        <TreeScene tree={visual({ stage: 'final_form', richness: 5 })} timeOfDay="night" />,
      );
    } finally {
      random.mockRestore();
    }
  });

  it('runs the idle sway when motion is allowed', () => {
    renderWithProviders(<TreeScene tree={visual()} timeOfDay="day" />);
    expect(withRepeat).toHaveBeenCalled();
  });

  it('keeps the tree still under reduced motion, with the same tree drawn', () => {
    renderWithProviders(<TreeScene tree={visual()} timeOfDay="day" />);
    const moving = ellipses().length;
    screen.unmount();
    withRepeat.mockClear();
    renderWithProviders(<TreeScene tree={visual()} timeOfDay="day" />, { reducedMotion: true });
    expect(withRepeat).not.toHaveBeenCalled();
    expect(ellipses().length).toBe(moving);
    expect(screen.getByRole('image').props.accessibilityLabel).toBe(describeTree(visual()));
  });

  it('does not animate a still scene, such as a forest thumbnail off screen', () => {
    renderWithProviders(<TreeScene tree={visual()} size="thumbnail" motion="still" />);
    expect(withRepeat).not.toHaveBeenCalled();
    const style = StyleSheet.flatten(screen.getByRole('image').props.style);
    expect(style.width).toBe(lightTheme.treeScene.thumbnail);
  });

  it('suspends the idle animation while it is not visible', () => {
    const tree = visual();
    renderWithProviders(<TreeScene tree={tree} timeOfDay="day" active={false} />);
    expect(withRepeat).not.toHaveBeenCalled();
    screen.rerender(<TreeScene tree={tree} timeOfDay="day" active />);
    expect(withRepeat).toHaveBeenCalled();
    cancelAnimation.mockClear();
    screen.rerender(<TreeScene tree={tree} timeOfDay="day" active={false} />);
    expect(cancelAnimation).toHaveBeenCalled();
  });

  it('suspends the idle animation while the app is in the background', async () => {
    const appState = mockAppState();
    renderWithProviders(<TreeScene tree={visual()} timeOfDay="day" />);
    expect(withRepeat).toHaveBeenCalled();
    withRepeat.mockClear();
    cancelAnimation.mockClear();
    await appState.emit('background');
    expect(cancelAnimation).toHaveBeenCalled();
    expect(withRepeat).not.toHaveBeenCalled();
    await appState.emit('active');
    expect(withRepeat).toHaveBeenCalled();
  });

  it('stops listening to the app state when it unmounts', () => {
    const appState = mockAppState();
    renderWithProviders(<TreeScene tree={visual()} timeOfDay="day" />);
    expect(appState.listeners()).toBe(1);
    screen.unmount();
    expect(appState.listeners()).toBe(0);
  });

  describe('growth reactions', () => {
    it('cross-fades from the previous stage, then lets the old tree go', () => {
      jest.useFakeTimers();
      const ref = createRef<TreeSceneHandle>();
      const before = visual({ stage: 'growing_tree' });
      const after = visual({ stage: 'mature_tree' });
      renderWithProviders(<TreeScene ref={ref} tree={after} timeOfDay="day" />);
      act(() => ref.current!.react({ kind: 'stage', from: before }));
      expect(screen.getByTestId('tree-outgoing', hidden)).toBeTruthy();
      expect(withSpring).toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(lightTheme.motion.growth));
      expect(screen.queryByTestId('tree-outgoing', hidden)).toBeNull();
      // The description is the current tree's, during and after the change.
      expect(screen.getByRole('image').props.accessibilityLabel).toBe(describeTree(after));
    });

    it('fades without a gust under reduced motion', () => {
      jest.useFakeTimers();
      const ref = createRef<TreeSceneHandle>();
      renderWithProviders(<TreeScene ref={ref} tree={visual()} timeOfDay="day" />, {
        reducedMotion: true,
      });
      act(() => ref.current!.react({ kind: 'stage', from: visual({ stage: 'sprout' }) }));
      expect(withSpring).not.toHaveBeenCalled();
      expect(screen.getByTestId('tree-outgoing', hidden)).toBeTruthy();
      act(() => jest.advanceTimersByTime(lightTheme.motion.fast));
      expect(screen.queryByTestId('tree-outgoing', hidden)).toBeNull();
    });

    it('shows the final state at once when it is not visible', () => {
      const ref = createRef<TreeSceneHandle>();
      renderWithProviders(<TreeScene ref={ref} tree={visual()} timeOfDay="day" active={false} />);
      act(() => ref.current!.react({ kind: 'stage', from: visual({ stage: 'sprout' }) }));
      expect(screen.queryByTestId('tree-outgoing', hidden)).toBeNull();
      expect(withSpring).not.toHaveBeenCalled();
    });

    it('accepts growth, blossom, and trait reactions', () => {
      const ref = createRef<TreeSceneHandle>();
      renderWithProviders(<TreeScene ref={ref} tree={visual()} timeOfDay="day" />);
      for (const kind of ['growth', 'blossoms', 'trait'] as const) {
        expect(() => act(() => ref.current!.react({ kind }))).not.toThrow();
      }
    });
  });

  it('renders an archived tree with unknown traits', () => {
    renderWithProviders(
      <TreeScene
        tree={visual({ status: 'archived', traits: ['event-lantern:1', 'streak-days:3'] })}
        timeOfDay="dusk"
        locale="en-US"
      />,
    );
    expect(screen.getByRole('image').props.accessibilityLabel).toMatch(/At rest\.$/);
  });

  it('reads the app state it starts in', () => {
    // React Native's jest mock makes currentState a function; the real one is a string.
    const appState = AppState as unknown as { currentState: unknown };
    const original = appState.currentState;
    appState.currentState = 'background';
    try {
      renderWithProviders(<TreeScene tree={visual()} timeOfDay="day" />);
      expect(withRepeat).not.toHaveBeenCalled();
    } finally {
      appState.currentState = original;
    }
  });
});
