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

// Passwords are kept exactly as typed.
const newPassword = z
  .string()
  .min(8, 'Use at least 8 characters for your password.')
  .max(128, 'Use at most 128 characters for your password.');

export const signUpSchema = z.object({
  email,
  password: newPassword,
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

/** W.3 Forgot password: the email to send a code to, then the code and a new password. */
export const resetRequestSchema = z.object({ email });
export const resetConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
  password: newPassword,
});

export type SignUpValues = z.infer<typeof signUpSchema>;
export type ResetRequestValues = z.infer<typeof resetRequestSchema>;
export type ResetConfirmValues = z.infer<typeof resetConfirmSchema>;
export type SignInValues = z.infer<typeof signInSchema>;
