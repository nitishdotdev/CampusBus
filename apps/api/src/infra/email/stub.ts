import type { EmailSender } from '../../domain/types';

/** Local placeholder. A configured delivery adapter is required for email-based recovery. */
export class ConsoleEmailSender implements EmailSender {
  async sendVerification() { console.warn('[email] Verification delivery is not configured.'); }
  async sendPasswordReset() { console.warn('[email] Password reset delivery is not configured.'); }
}
