import { fireEvent, screen } from 'expo-router/testing-library';

/** The welcome's first heading: what a signed-out launch shows first. */
export const WELCOME_TITLE = 'Focus grows a tree';

/** From the welcome, the way a new person goes: to its last page, then Get started. */
export async function signUpFromWelcome(): Promise<void> {
  await screen.findByRole('header', { name: WELCOME_TITLE });
  fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Get started' }));
  await screen.findByRole('header', { name: 'Create your account' });
}
