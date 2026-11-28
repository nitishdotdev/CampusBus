import type { ZodError } from 'zod';

/**
 * Plain-language text for a failed request validation. Raw validator output
 * (for example "Too big: expected string to have <=120 characters") is never
 * returned to clients; the field name decides which sentence is sent.
 */
const FIELD_MESSAGES: Record<string, string> = {
  password: 'Use 8 to 72 characters, including a letter and a number or symbol.',
  newPassword: 'Use 8 to 72 characters, including a letter and a number or symbol.',
  currentPassword: 'Enter your current password.',
  email: 'Enter a valid email address.',
  name: 'Enter a name up to 120 characters.',
  campusId: 'Choose a valid campus.',
  otp: 'Enter the 6-digit code from the email.',
  phone: 'Enter a phone number up to 32 characters.',
};

export function publicValidationMessage(error: ZodError): string {
  const field = error.issues[0]?.path[0];
  return (typeof field === 'string' && FIELD_MESSAGES[field]) || 'Check the highlighted details and try again.';
}
