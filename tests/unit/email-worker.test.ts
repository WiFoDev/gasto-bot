import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../../infra/email-worker/worker.js';

const RAW = 'From: BCP <notificaciones@notificacionesbcp.com.pe>\r\nSubject: hi\r\n\r\nbody';
const FORWARDER = 'someone@gmail.com';

const env = {
  INBOUND_URL: 'https://bot.example.com/inbound/bank-email',
  INBOUND_EMAIL_SECRET: 's3cret',
  ALLOWED_FORWARDER: FORWARDER,
};

function makeMessage(from: string, raw = RAW) {
  const bytes = new TextEncoder().encode(raw);
  return {
    from,
    to: 'gastos-abc@mail.example.com',
    rawSize: bytes.length,
    raw: new Response(bytes).body!,
    setReject: vi.fn(),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('{"status":"processed"}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('email worker', () => {
  it('POSTs the raw MIME with the bearer secret', async () => {
    const message = makeMessage(FORWARDER);

    await worker.email(message, env);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(env.INBOUND_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      authorization: 'Bearer s3cret',
      'content-type': 'message/rfc822',
    });
    expect(new TextDecoder().decode(init.body)).toBe(RAW);
    expect(message.setReject).not.toHaveBeenCalled();
  });

  it('accepts Gmail auto-forward envelopes (local+caf_…@gmail.com)', async () => {
    await worker.email(makeMessage('Someone+caf_=gastos-abc=mail.example.com@gmail.com'), env);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects any other envelope sender without calling the bot', async () => {
    const message = makeMessage('notificaciones@notificacionesbcp.com.pe');
    await worker.email(message, env);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.setReject).toHaveBeenCalledOnce();
  });

  it('rejects a look-alike forwarder', async () => {
    const message = makeMessage('someone+caf_=x@gmail.com.evil.com');
    await worker.email(message, env);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.setReject).toHaveBeenCalledOnce();
  });

  it('rejects everything when ALLOWED_FORWARDER is not configured', async () => {
    const message = makeMessage(FORWARDER);
    await worker.email(message, { ...env, ALLOWED_FORWARDER: '' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.setReject).toHaveBeenCalledOnce();
  });

  it('rejects oversized messages', async () => {
    const message = { ...makeMessage(FORWARDER), rawSize: 2 * 1024 * 1024 };
    await worker.email(message, env);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.setReject).toHaveBeenCalledOnce();
  });

  it('does not throw or bounce when the bot answers non-2xx or is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    const m1 = makeMessage(FORWARDER);
    await expect(worker.email(m1, env)).resolves.toBeUndefined();
    expect(m1.setReject).not.toHaveBeenCalled();

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const m2 = makeMessage(FORWARDER);
    await expect(worker.email(m2, env)).resolves.toBeUndefined();
    expect(m2.setReject).not.toHaveBeenCalled();
  });
});
