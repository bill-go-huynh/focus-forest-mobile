import { fireEvent, screen } from 'expo-router/testing-library';

/** The welcome's first heading: what a signed-out launch shows first. */
export const WELCOME_TITLE = 'Focus grows a tree';

/** From the welcome, straight to sign up. */
export async function signUpFromWelcome(): Promise<void> {
  await screen.findByRole('header', { name: WELCOME_TITLE });
  fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('header', { name: 'Create your account' });
}
