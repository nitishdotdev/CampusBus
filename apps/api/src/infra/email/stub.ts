import type { EmailSender } from '../../domain/types';
export class ConsoleEmailSender implements EmailSender {
  async sendVerification(to: string, name: string, token: string) { console.info(`[email stub] VERIFY_EMAIL to=${to} name=${name} token=${token}`); }
  async sendPasswordReset(to: string, name: string, token: string) { console.info(`[email stub] RESET_PASSWORD to=${to} name=${name} token=${token}`); }
}
