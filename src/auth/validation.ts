import { z } from 'zod';

/**
 * Sign-up and sign-in form rules. They mirror the API (A3: email, password 8–128;
 * A4: display name 1–50 characters on one line) so most mistakes are caught before a
 * request, in kind words that never blame the user.
 */
const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'Enter a valid email address.')
  .pipe(z.email('Enter a valid email address.'));

export const signUpSchema = z.object({
  email,
  // Passwords are kept exactly as typed.
  password: z
    .string()
    .min(8, 'Use at least 8 characters for your password.')
    .max(128, 'Use at most 128 characters for your password.'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Add the name you would like to be called.')
    .max(50, 'Keep your name to 50 characters or fewer.')
    .regex(/^\P{Cc}*$/u, 'Keep your name on one line.'),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(128, 'Enter your password.'),
});

export type SignUpValues = z.infer<typeof signUpSchema>;
export type SignInValues = z.infer<typeof signInSchema>;
