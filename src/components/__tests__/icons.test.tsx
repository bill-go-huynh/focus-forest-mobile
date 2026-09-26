import { screen } from '@testing-library/react-native';
import { Circle, Path, Rect } from 'react-native-svg';

import { renderWithProviders } from '../../test-utils/render';
import { lightTheme } from '../../theme';
import { TAB_ICON_NAMES, TabIcon, tabIconStatus } from '../icons';

const shapes = () =>
  screen.UNSAFE_root.findAll((node) => [Circle, Path, Rect].includes(node.type as never));

describe('tab icons (docs/01 §5: rounded line icons; the active tab is filled)', () => {
  it('covers the four tabs', () => {
    expect([...TAB_ICON_NAMES].sort()).toEqual(['forest', 'index', 'insights', 'profile']);
  });

  it('is marked provisional until Phase 0 picks the icon family', () => {
    expect(tabIconStatus).toBe('placeholder');
  });

  it.each(TAB_ICON_NAMES)('draws %s as a line icon with the stroke token', (name) => {
    renderWithProviders(<TabIcon name={name} filled={false} color="#123456" size={24} />);
    for (const shape of shapes()) {
      expect(shape.props.stroke).toBe('#123456');
      expect(shape.props.strokeWidth).toBe(lightTheme.lineIcon.strokeWidth);
      expect(shape.props.fill).toBe('none');
      expect(shape.props.strokeLinecap ?? 'round').toBe('round');
    }
  });

  it.each(TAB_ICON_NAMES)('fills %s when active', (name) => {
    renderWithProviders(<TabIcon name={name} filled color="#123456" size={24} />);
    expect(shapes().some((shape) => shape.props.fill === '#123456')).toBe(true);
  });

  it('is hidden from screen readers', () => {
    renderWithProviders(<TabIcon name="index" filled color="#123456" size={24} />);
    expect(screen.queryByTestId('tab-icon-index-filled')).toBeNull();
    expect(
      screen.getByTestId('tab-icon-index-filled', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });
});
