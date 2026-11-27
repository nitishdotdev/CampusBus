import { describe, expect, it, vi } from 'vitest';
import { createEmailSender } from '../src/infra/email/resend';

describe('Email delivery configuration', () => {
  it('leaves delivery disabled with no settings and rejects partial configuration', () => {
    expect(createEmailSender({})).toBeUndefined();
    expect(() => createEmailSender({ EMAIL_FROM: 'dispatch@example.org' })).toThrow(/Configure both/);
  });

  it('uses a fixed HTTPS endpoint and sends the code only to the intended recipient', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const sender = createEmailSender({ EMAIL_FROM: 'dispatch@example.org', RESEND_API_KEY: 'dummy-key' }, request)!;
    await sender.sendPasswordReset('student@example.org', 'Student', '001234');
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer dummy-key' } });
    expect(JSON.parse(options!.body as string)).toMatchObject({
      from: 'dispatch@example.org', to: ['student@example.org'], text: expect.stringContaining('001234'),
    });
  });

  it('does not expose a provider response containing private information', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('private diagnostic', { status: 403 }));
    const sender = createEmailSender({ EMAIL_FROM: 'dispatch@example.org', RESEND_API_KEY: 'dummy-key' }, request)!;
    await expect(sender.sendPasswordReset('student@example.org', 'Student', '001234')).rejects.toThrow('Email provider rejected delivery.');
  });
});
