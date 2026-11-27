import type { EmailSender } from '../../domain/types';

export function createEmailSender(env: NodeJS.ProcessEnv, request = fetch): EmailSender | undefined {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey && !from) return undefined;
  if (!apiKey || !from) throw new Error('Configure both RESEND_API_KEY and EMAIL_FROM for email delivery.');

  async function send(to: string, subject: string, message: string) {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text: message }),
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Email provider rejected delivery.');
  }

  return {
    sendVerification: (to, _name, token) => send(to, 'Verify your CampusBus email', `Your CampusBus verification code is ${token}.`),
    sendPasswordReset: (to, _name, token) => send(to, 'Reset your CampusBus password',
      `Your CampusBus password reset code is ${token}. If you did not request this code, you can ignore this email.`),
  };
}
