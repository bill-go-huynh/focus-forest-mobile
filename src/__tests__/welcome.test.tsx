import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { avoidedWordProblems, renderedCopy } from '../test-utils/avoided-words';

// Boundaries only: secure storage (no saved session: the person is signed out) and the config.
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const PAGES = [
  'Focus grows a tree',
  'One month, one tree',
  'A forest of your months',
  'Rest is part of growing',
];

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
  await AsyncStorage.clear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
});

const openApp = () => renderApp(appRoutes, { initialUrl: '/' });
const page = (n: number) => screen.getByLabelText(`Page ${n} of ${PAGES.length}`);
const swipeTo = (index: number) =>
  fireEvent(screen.getByTestId('welcome-pager'), 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: index * Dimensions.get('window').width, y: 0 } },
  });

describe('welcome (docs/02 Onboarding: the concept before account creation)', () => {
  it('is the first thing a signed-out person sees, before sign up', async () => {
    openApp();
    expect(await screen.findByRole('header', { name: PAGES[0] })).toBeOnTheScreen();
    expect(page(1)).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Create your account' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'I already have an account' })).toBeOnTheScreen();
  });

  it('walks the pages with Next, one at a time, and ends on Get started', async () => {
    openApp();
    await screen.findByRole('header', { name: PAGES[0] });
    for (let i = 1; i < PAGES.length; i += 1) {
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      expect(await screen.findByRole('header', { name: PAGES[i] })).toBeOnTheScreen();
      expect(page(i + 1)).toBeOnTheScreen();
      // Only the page in view is read: the others are off screen.
      expect(screen.queryByRole('header', { name: PAGES[i - 1] })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeOnTheScreen();
  });

  it('follows a swipe', async () => {
    openApp();
    await screen.findByRole('header', { name: PAGES[0] });
    act(() => swipeTo(2));
    expect(await screen.findByRole('header', { name: PAGES[2] })).toBeOnTheScreen();
    expect(page(3)).toBeOnTheScreen();
    act(() => swipeTo(1));
    expect(await screen.findByRole('header', { name: PAGES[1] })).toBeOnTheScreen();
  });

  it('can skip to the last page', async () => {
    openApp();
    await screen.findByRole('header', { name: PAGES[0] });
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('header', { name: PAGES[3] })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeOnTheScreen();
  });

  it('Get started opens sign up', async () => {
    const router = openApp();
    await screen.findByRole('header', { name: PAGES[0] });
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Get started' }));
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-up');
  });

  it('leads straight to sign in from any page', async () => {
    const router = openApp();
    await screen.findByRole('header', { name: PAGES[0] });
    fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    expect(await screen.findByRole('header', { name: 'Welcome back' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
  });

  it('keeps its illustrations decorative and its words calm', async () => {
    openApp();
    await screen.findByRole('header', { name: PAGES[0] });
    // The scenes are examples, not anyone's tree: the page's words carry the meaning.
    expect(screen.queryAllByRole('image')).toEqual([]);
    for (let i = 0; i < PAGES.length; i += 1) {
      act(() => swipeTo(i));
      await screen.findByRole('header', { name: PAGES[i] });
      expect(renderedCopy(screen.toJSON()).flatMap(avoidedWordProblems)).toEqual([]);
    }
  });

  it('still works with reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    openApp();
    await screen.findByRole('header', { name: PAGES[0] });
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('header', { name: PAGES[1] })).toBeOnTheScreen();
  });
});
