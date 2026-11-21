import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { BCP_EMAIL_FIXTURES, toMime } from '../fixtures/bcp-emails.js';

// ── Mocks ────────────────────────────────────────────────────────

const mockSendText = vi.fn().mockResolvedValue({
  messagingProduct: 'whatsapp',
  contacts: [],
  messages: [{ id: 'wamid.reply123' }],
});

const mockSendInteractiveButtons = vi.fn().mockResolvedValue({
  messagingProduct: 'whatsapp',
  contacts: [],
  messages: [{ id: 'wamid.buttons123' }],
});

vi.mock('@kapso/whatsapp-cloud-api', () => ({
  WhatsAppClient: class {
    messages = {
      sendText: mockSendText,
      sendInteractiveButtons: mockSendInteractiveButtons,
    };
  },
}));

const inboundConfig = vi.hoisted(() => ({ secret: 'test-inbound-secret' as string | undefined }));

vi.mock('../../src/config.js', () => ({
  KAPSO_API_KEY: 'test-kapso-key',
  KAPSO_WEBHOOK_SECRET: 'test-webhook-secret',
  CRON_SECRET: 'test-cron-secret',
  KAPSO_PHONE_NUMBER_ID: 'pn_static',
  BANK_EMAIL_USER_PHONE: '+51999888777',
  get INBOUND_EMAIL_SECRET() {
    return inboundConfig.secret;
  },
}));

const mockPingDatabase = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/db.js', () => ({
  pingDatabase: () => mockPingDatabase(),
}));

// ── Helpers ──────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-webhook-secret';
const CRON_SECRET = 'test-cron-secret';

function sign(payload: Record<string, unknown>): string {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      id: 'wamid.abc123',
      type: 'text',
      timestamp: '1730092800',
      from: '+51999888777',
      text: { body: 'almuerzo 35 soles' },
      kapso: { direction: 'inbound' },
    },
    conversation: {
      id: 'conv_001',
      phone_number: '+51999888777',
      status: 'active',
    },
    is_new_conversation: false,
    phone_number_id: 'pn_12345',
    ...overrides,
  };
}

async function buildApp(
  handleMessage = vi.fn().mockResolvedValue({ text: 'OK logged' }),
  handleBankEmail = vi.fn().mockResolvedValue({
    text: '🏦 S/22.90 — 🚗 Transport',
    buttons: [{ id: 'bank_delete:exp-1', title: '🗑 Borrar' }],
  }),
) {
  const { default: webhookPlugin } = await import('../../src/webhook.js');
  const app = Fastify();

  // Mirror the preParsing hook from index.ts so rawBody is available
  app.addHook('preParsing', async (request, _reply, payload) => {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks);
    (request as any).rawBody = rawBody;
    return Readable.from(rawBody);
  });

  await app.register(webhookPlugin, { handleMessage, handleBankEmail });
  return { app, handleMessage, handleBankEmail };
}

function inject(
  app: ReturnType<typeof Fastify>,
  payload: Record<string, unknown>,
  signature?: string,
) {
  const body = JSON.stringify(payload);
  return app.inject({
    method: 'POST',
    url: '/webhook',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-webhook-signature': signature } : {}),
    },
    payload: body,
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe('webhook plugin', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear dedup set between tests
    const { recentMessageIds } = await import('../../src/webhook.js');
    recentMessageIds.clear();
  });

  // ── Health check ─────────────────────────────────────────────

  it('GET /health returns 200 with status ok', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  // ── Keep-alive cron ──────────────────────────────────────────

  function injectKeepAlive(
    app: ReturnType<typeof Fastify>,
    token?: string,
    method: 'GET' | 'POST' = 'GET',
  ) {
    return app.inject({
      method,
      url: '/cron/keep-alive',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it('GET /cron/keep-alive pings the database with a valid token', async () => {
    const { app } = await buildApp();
    const res = await injectKeepAlive(app, CRON_SECRET);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, database: 'ok' });
    expect(mockPingDatabase).toHaveBeenCalledTimes(1);
  });

  it('POST /cron/keep-alive works the same as GET', async () => {
    const { app } = await buildApp();
    const res = await injectKeepAlive(app, CRON_SECRET, 'POST');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, database: 'ok' });
  });

  it('rejects keep-alive without a token and never touches the DB', async () => {
    const { app } = await buildApp();
    const res = await injectKeepAlive(app);

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockPingDatabase).not.toHaveBeenCalled();
  });

  it('rejects keep-alive with a wrong token', async () => {
    const { app } = await buildApp();
    const res = await injectKeepAlive(app, 'wrong-cron-secret');

    expect(res.statusCode).toBe(401);
    expect(mockPingDatabase).not.toHaveBeenCalled();
  });

  it('returns 200 with ok:false when the DB probe fails', async () => {
    mockPingDatabase.mockRejectedValueOnce(new Error('connection refused'));
    const { app } = await buildApp();
    const res = await injectKeepAlive(app, CRON_SECRET);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: false,
      database: { error: 'connection refused' },
    });
  });

  // ── Signature validation ─────────────────────────────────────

  it('rejects request with missing signature', async () => {
    const { app } = await buildApp();
    const payload = makePayload();
    const res = await inject(app, payload); // no signature
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('rejects request with invalid signature', async () => {
    const { app } = await buildApp();
    const payload = makePayload();
    const res = await inject(app, payload, 'bad-signature');
    expect(res.statusCode).toBe(401);
  });

  // ── Missing fields ───────────────────────────────────────────

  it('returns 400 when message is missing', async () => {
    const { app } = await buildApp();
    const payload = {
      conversation: { phone_number: '+51999' },
      phone_number_id: 'pn_1',
    };
    const res = await inject(app, payload, sign(payload));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('returns 400 when conversation.phone_number is missing', async () => {
    const { app } = await buildApp();
    const payload = makePayload({
      conversation: { id: 'conv_1', status: 'active' },
    });
    const res = await inject(app, payload, sign(payload));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when phone_number_id is missing', async () => {
    const { app } = await buildApp();
    const payload = makePayload({ phone_number_id: undefined });
    const res = await inject(app, payload, sign(payload));
    expect(res.statusCode).toBe(400);
  });

  // ── Text message handling ────────────────────────────────────

  it('processes text message and sends reply', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'Logged S/35.00' });
    const { app } = await buildApp(handler);
    const payload = makePayload();
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(handler).toHaveBeenCalledWith(
      '+51999888777',
      'text',
      'almuerzo 35 soles',
    );
    expect(mockSendText).toHaveBeenCalledWith({
      phoneNumberId: 'pn_12345',
      to: '+51999888777',
      body: 'Logged S/35.00',
    });
  });

  // ── Image message handling ───────────────────────────────────

  it('processes image message with kapso mediaUrl', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'Receipt processed' });
    const { app } = await buildApp(handler);
    const payload = makePayload({
      message: {
        id: 'wamid.img1',
        type: 'image',
        timestamp: '1730092800',
        image: { id: 'media_123' },
        kapso: {
          direction: 'inbound',
          hasMedia: true,
          mediaUrl: 'https://media.kapso.ai/receipt.jpg',
        },
      },
    });
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      '+51999888777',
      'image',
      'https://media.kapso.ai/receipt.jpg',
    );
  });

  it('falls back to image.link when kapso mediaUrl is absent', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'Receipt processed' });
    const { app } = await buildApp(handler);
    const payload = makePayload({
      message: {
        id: 'wamid.img2',
        type: 'image',
        timestamp: '1730092800',
        image: { link: 'https://cdn.whatsapp.net/receipt.jpg' },
        kapso: { direction: 'inbound' },
      },
    });
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      '+51999888777',
      'image',
      'https://cdn.whatsapp.net/receipt.jpg',
    );
  });

  // ── Skipping logic ───────────────────────────────────────────

  it('skips outbound messages', async () => {
    const handler = vi.fn();
    const { app } = await buildApp(handler);
    const payload = makePayload({
      message: {
        id: 'wamid.out1',
        type: 'text',
        timestamp: '1730092800',
        text: { body: 'outbound reply' },
        kapso: { direction: 'outbound' },
      },
    });
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'skipped' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('skips unsupported message types', async () => {
    const handler = vi.fn();
    const { app } = await buildApp(handler);
    const payload = makePayload({
      message: {
        id: 'wamid.audio1',
        type: 'audio',
        timestamp: '1730092800',
        kapso: { direction: 'inbound' },
      },
    });
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'unsupported_type' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('skips empty text messages', async () => {
    const handler = vi.fn();
    const { app } = await buildApp(handler);
    const payload = makePayload({
      message: {
        id: 'wamid.empty1',
        type: 'text',
        timestamp: '1730092800',
        text: { body: '   ' },
        kapso: { direction: 'inbound' },
      },
    });
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'empty_message' });
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Error handling ───────────────────────────────────────────

  it('returns friendly message when handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const { app } = await buildApp(handler);
    const payload = makePayload();
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(mockSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Algo salió mal, intenta de nuevo.',
      }),
    );
  });

  it('still returns 200 when Kapso send fails', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'reply text' });
    mockSendText.mockRejectedValueOnce(new Error('Kapso timeout'));
    const { app } = await buildApp(handler);
    const payload = makePayload();
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  // ── Duplicate message handling ──────────────────────────────────

  it('skips duplicate messages with same ID', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'OK' });
    const { app } = await buildApp(handler);
    const payload = makePayload();

    // First request — should process
    const res1 = await inject(app, payload, sign(payload));
    expect(res1.statusCode).toBe(200);
    expect(res1.json()).toEqual({ status: 'ok' });
    expect(handler).toHaveBeenCalledTimes(1);

    // Second request with same message ID — should be skipped
    const res2 = await inject(app, payload, sign(payload));
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ status: 'duplicate' });
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it('processes messages with different IDs', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'OK' });
    const { app } = await buildApp(handler);

    const payload1 = makePayload();
    const payload2 = makePayload({
      message: {
        id: 'wamid.different',
        type: 'text',
        timestamp: '1730092800',
        from: '+51999888777',
        text: { body: 'uber 23' },
        kapso: { direction: 'inbound' },
      },
    });

    const res1 = await inject(app, payload1, sign(payload1));
    const res2 = await inject(app, payload2, sign(payload2));

    expect(res1.json()).toEqual({ status: 'ok' });
    expect(res2.json()).toEqual({ status: 'ok' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  // ── Unsupported media reply ─────────────────────────────────────

  it('sends reply for unsupported message types', async () => {
    const handler = vi.fn();
    const { app } = await buildApp(handler);
    const payload = makePayload({
      message: {
        id: 'wamid.audio1',
        type: 'audio',
        timestamp: '1730092800',
        kapso: { direction: 'inbound' },
      },
    });
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'unsupported_type' });
    expect(handler).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Solo puedo procesar texto y fotos por ahora.',
      }),
    );
  });

  // ── Interactive reply buttons (TASK-77) ─────────────────────────

  function buttonPayload(id: string, messageId = 'wamid.btn1') {
    return makePayload({
      message: {
        id: messageId,
        type: 'interactive',
        timestamp: '1730092800',
        interactive: {
          type: 'button_reply',
          button_reply: { id, title: '✅ Guardar' },
        },
        kapso: { direction: 'inbound' },
      },
    });
  }

  it('passes a button tap to the handler as type "button" with the button id', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'Guardado' });
    const { app } = await buildApp(handler);
    const payload = buttonPayload('expense_confirm');
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledWith('+51999888777', 'button', 'expense_confirm');
    expect(mockSendText).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Guardado' }),
    );
  });

  it('treats non-button interactive messages as unsupported', async () => {
    const handler = vi.fn();
    const { app } = await buildApp(handler);
    const payload = makePayload({
      message: {
        id: 'wamid.list1',
        type: 'interactive',
        timestamp: '1730092800',
        interactive: { type: 'list_reply', list_reply: { id: 'x', title: 'X' } },
        kapso: { direction: 'inbound' },
      },
    });
    const res = await inject(app, payload, sign(payload));

    expect(res.json()).toEqual({ status: 'unsupported_type' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('sends interactive buttons when the reply has buttons', async () => {
    const buttons = [
      { id: 'expense_confirm', title: '✅ Guardar' },
      { id: 'expense_cancel', title: '❌ Cancelar' },
    ];
    const handler = vi.fn().mockResolvedValue({ text: '¿Lo registro?', buttons });
    const { app } = await buildApp(handler);
    const payload = makePayload();
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(mockSendInteractiveButtons).toHaveBeenCalledWith({
      phoneNumberId: 'pn_12345',
      to: '+51999888777',
      bodyText: '¿Lo registro?',
      buttons,
    });
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('falls back to plain text when sending buttons fails', async () => {
    mockSendInteractiveButtons.mockRejectedValueOnce(new Error('Kapso 400'));
    const handler = vi.fn().mockResolvedValue({
      text: '¿Lo registro?',
      buttons: [{ id: 'expense_confirm', title: '✅ Guardar' }],
    });
    const { app } = await buildApp(handler);
    const payload = makePayload();
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(mockSendText).toHaveBeenCalledWith({
      phoneNumberId: 'pn_12345',
      to: '+51999888777',
      body: '¿Lo registro?',
    });
  });

  it('sends plain text when the reply has an empty buttons array', async () => {
    const handler = vi.fn().mockResolvedValue({ text: 'Hola', buttons: [] });
    const { app } = await buildApp(handler);
    const payload = makePayload();
    await inject(app, payload, sign(payload));

    expect(mockSendInteractiveButtons).not.toHaveBeenCalled();
    expect(mockSendText).toHaveBeenCalledWith(expect.objectContaining({ body: 'Hola' }));
  });
});

// ── POST /inbound/bank-email (TASK-72) ───────────────────────────────

describe('POST /inbound/bank-email', () => {
  const INBOUND_SECRET = 'test-inbound-secret';
  const purchase = BCP_EMAIL_FIXTURES[0];
  const debit = BCP_EMAIL_FIXTURES.find((f) => f.label.startsWith('debit-card'))!;

  function postEmail(
    app: ReturnType<typeof Fastify>,
    body: string,
    { auth = `Bearer ${INBOUND_SECRET}`, contentType = 'message/rfc822' } = {},
  ) {
    return app.inject({
      method: 'POST',
      url: '/inbound/bank-email',
      headers: { 'content-type': contentType, ...(auth ? { authorization: auth } : {}) },
      payload: body,
    });
  }

  let logs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    inboundConfig.secret = INBOUND_SECRET;
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
  });

  const events = () => logs.map((l) => { try { return JSON.parse(l); } catch { return {}; } });

  describe('auth', () => {
    it('401 without a bearer token', async () => {
      const { app, handleBankEmail } = await buildApp();
      const res = await postEmail(app, toMime(purchase.email), { auth: '' });
      expect(res.statusCode).toBe(401);
      expect(handleBankEmail).not.toHaveBeenCalled();
    });

    it('401 with the wrong token', async () => {
      const { app, handleBankEmail } = await buildApp();
      const res = await postEmail(app, toMime(purchase.email), { auth: 'Bearer nope-nope-nope-nope' });
      expect(res.statusCode).toBe(401);
      expect(handleBankEmail).not.toHaveBeenCalled();
    });

    it('401 when INBOUND_EMAIL_SECRET is not configured', async () => {
      inboundConfig.secret = undefined;
      const { app, handleBankEmail } = await buildApp();
      const res = await postEmail(app, toMime(purchase.email), { auth: 'Bearer ' });
      expect(res.statusCode).toBe(401);
      expect(handleBankEmail).not.toHaveBeenCalled();
      expect(events().some((e) => e.event === 'bank_email_unauthorized' && e.reason === 'secret_not_configured')).toBe(true);
    });
  });

  it('happy path: parses, registers and notifies the configured user', async () => {
    const { app, handleBankEmail } = await buildApp();

    const res = await postEmail(app, toMime(purchase.email));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'processed' });
    expect(handleBankEmail).toHaveBeenCalledWith(expect.objectContaining({
      bank: 'bcp',
      amount: purchase.expected!.amount,
      merchant: purchase.expected!.merchant,
      operation_number: purchase.expected!.operation_number,
    }));
    expect(mockSendInteractiveButtons).toHaveBeenCalledWith({
      phoneNumberId: 'pn_static',
      to: '+51999888777',
      bodyText: '🏦 S/22.90 — 🚗 Transport',
      buttons: [{ id: 'bank_delete:exp-1', title: '🗑 Borrar' }],
    });
  });

  it('accepts text/plain bodies too', async () => {
    const { app, handleBankEmail } = await buildApp();
    const res = await postEmail(app, toMime(purchase.email), { contentType: 'text/plain' });
    expect(res.statusCode).toBe(200);
    expect(handleBankEmail).toHaveBeenCalledOnce();
  });

  it('rejects a sender other than BCP with 200 and no side effects', async () => {
    const { app, handleBankEmail } = await buildApp();

    const res = await postEmail(app, toMime(purchase.email, 'Attacker <notificaciones@notificacionesbcp.com.pe.evil.com>'));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'rejected' });
    expect(handleBankEmail).not.toHaveBeenCalled();
    expect(mockSendText).not.toHaveBeenCalled();
    expect(events().some((e) => e.event === 'bank_email_rejected' && e.reason === 'wrong_sender')).toBe(true);
  });

  it('skips a non-consumo BCP email (debit card) with 200', async () => {
    const { app, handleBankEmail } = await buildApp();

    const res = await postEmail(app, toMime(debit.email));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'skipped' });
    expect(handleBankEmail).not.toHaveBeenCalled();
    expect(events().some((e) => e.event === 'bank_email_skipped')).toBe(true);
  });

  it('an empty body is rejected with 200', async () => {
    const { app, handleBankEmail } = await buildApp();
    const res = await postEmail(app, '', { contentType: 'text/plain' });
    expect(res.statusCode).toBe(200);
    expect(handleBankEmail).not.toHaveBeenCalled();
  });

  it('duplicate (handler returns null): 200, no message sent', async () => {
    const { app } = await buildApp(undefined, vi.fn().mockResolvedValue(null));

    const res = await postEmail(app, toMime(purchase.email));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ignored' });
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('notify failure still answers 200 and logs bank_notify_error', async () => {
    mockSendInteractiveButtons.mockRejectedValueOnce(new Error('Kapso 500'));
    mockSendText.mockRejectedValueOnce(new Error('Kapso 500'));
    const { app, handleBankEmail } = await buildApp();

    const res = await postEmail(app, toMime(purchase.email));

    expect(res.statusCode).toBe(200);
    expect(handleBankEmail).toHaveBeenCalledOnce();
    expect(events().some((e) => e.event === 'bank_notify_error')).toBe(true);
  });

  it('handler error still answers 200 and logs bank_email_error', async () => {
    const { app } = await buildApp(undefined, vi.fn().mockRejectedValue(new Error('db down')));

    const res = await postEmail(app, toMime(purchase.email));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'error' });
    expect(mockSendText).not.toHaveBeenCalled();
    expect(events().some((e) => e.event === 'bank_email_error')).toBe(true);
  });

  it('logs never carry the email body', async () => {
    const { app } = await buildApp();
    await postEmail(app, toMime(purchase.email));

    const all = logs.join('\n');
    expect(all).not.toContain('Total del consumo');
    expect(all).not.toContain('<td');
    const processed = events().find((e) => e.event === 'bank_email_processed');
    expect(processed).toMatchObject({
      amount: purchase.expected!.amount,
      currency: purchase.expected!.currency,
      merchant: purchase.expected!.merchant,
      operation_number: purchase.expected!.operation_number,
    });
  });
});
