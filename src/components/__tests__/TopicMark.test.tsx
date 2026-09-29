import { screen } from '@testing-library/react-native';
import { Circle, Path } from 'react-native-svg';

import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Chip } from '../Chip';
import { ListRow } from '../ListRow';
import { TopicMark, topicColorKey, topicMarkStatus } from '../TopicMark';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

const shapes = () =>
  screen.UNSAFE_root.findAll((node) => [Circle, Path].includes(node.type as never));
const mark = (icon = 'book') =>
  screen.getByTestId(`topic-mark-${icon}`, { includeHiddenElements: true });

beforeEach(() => mockColorScheme.mockReturnValue('light'));
afterEach(() => jest.restoreAllMocks());

describe('topicColorKey (the API color identifier to the theme token)', () => {
  it.each([
    ['topic.1', 1],
    ['topic.7', 7],
    ['topic.12', 12],
  ] as const)('reads %s', (color, key) => {
    expect(topicColorKey(color)).toBe(key);
  });

  it.each(['topic.0', 'topic.13', 'topic.1.5', 'topic.01', '#5E7F4E', '', 'topic.'])(
    'answers null for %p, which is not a curated topic color',
    (color) => {
      expect(topicColorKey(color)).toBeNull();
    },
  );
});

describe('TopicMark (a topic’s icon in its color: never the topic’s only identity)', () => {
  it('is hidden from screen readers: the topic name next to it is what is read', () => {
    renderWithProviders(<TopicMark color="topic.3" icon="book" />);
    expect(screen.queryByTestId('topic-mark-book')).toBeNull();
    expect(mark().props.accessibilityElementsHidden).toBe(true);
    expect(mark().props.importantForAccessibility).toBe('no-hide-descendants');
  });

  describe.each(themes)('%s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('draws the line icon in the topic color token, with the icon stroke token', () => {
      renderWithProviders(<TopicMark color="topic.3" icon="book" />);
      expect(shapes().length).toBeGreaterThan(0);
      for (const shape of shapes()) {
        expect(shape.props.stroke).toBe(theme.colors.topic[3]);
        expect(shape.props.strokeWidth).toBe(theme.lineIcon.strokeWidth);
      }
    });

    it('draws an unknown color in a neutral text color instead of failing', () => {
      renderWithProviders(<TopicMark color="#00ff00" icon="book" />);
      for (const shape of shapes()) expect(shape.props.stroke).toBe(theme.colors.text.secondary);
    });

    it('draws a topic nothing is known about (no color) in the same neutral color', () => {
      renderWithProviders(<TopicMark color={null} icon="topic.default" />);
      expect(shapes().length).toBeGreaterThan(0);
      for (const shape of shapes()) expect(shape.props.stroke).toBe(theme.colors.text.secondary);
    });
  });

  it('draws the same placeholder for every identifier until the curated set exists', () => {
    expect(topicMarkStatus).toBe('placeholder');
    const outline = (icon: string) => {
      const { unmount } = renderWithProviders(<TopicMark color="topic.1" icon={icon} />);
      const drawn = JSON.stringify(shapes().map(({ props: { d, cx, r } }) => ({ d, cx, r })));
      unmount();
      return drawn;
    };
    expect(outline('a-future-icon')).toBe(outline('book'));
  });

  it('keeps the identifier it was given, so real icons can replace the placeholder', () => {
    renderWithProviders(<TopicMark color="topic.1" icon="music-note" />);
    expect(mark('music-note')).toBeOnTheScreen();
  });

  it.each([
    ['sm', lightTheme.icon.sm],
    ['md', lightTheme.icon.md],
    ['lg', lightTheme.icon.lg],
  ] as const)('sizes %s from the icon token', (size, pixels) => {
    renderWithProviders(<TopicMark color="topic.1" icon="book" size={size} />);
    const svg = mark().findByProps({ viewBox: '0 0 24 24' });
    expect(svg.props.width).toBe(pixels);
    expect(svg.props.height).toBe(pixels);
  });

  it('defaults to the list icon size', () => {
    renderWithProviders(<TopicMark color="topic.1" icon="book" />);
    expect(mark().findByProps({ viewBox: '0 0 24 24' }).props.width).toBe(lightTheme.icon.md);
  });
});

describe('with the existing primitives', () => {
  it('leads a list row that is read by the topic name', () => {
    renderWithProviders(
      <ListRow
        title="Reading"
        meta="25 min"
        leading={() => <TopicMark color="topic.2" icon="book" />}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reading, 25 min' })).toBeOnTheScreen();
    expect(mark()).toBeTruthy();
  });

  it('gives a chip its topic color and icon while the chip is named by its label', () => {
    renderWithProviders(
      <Chip
        label="Reading"
        selected
        topicColor={topicColorKey('topic.2') ?? undefined}
        icon={() => <TopicMark color="topic.2" icon="book" size="sm" />}
        onPress={jest.fn()}
      />,
    );
    const chip = screen.getByRole('button', { name: 'Reading' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('chip-topic-dot', { includeHiddenElements: true })).toBeTruthy();
  });
});
