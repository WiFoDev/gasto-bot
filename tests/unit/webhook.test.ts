import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ── Mocks ────────────────────────────────────────────────────────

const mockSendText = vi.fn().mockResolvedValue({
  messagingProduct: 'whatsapp',
  contacts: [],
  messages: [{ id: 'wamid.reply123' }],
});

vi.mock('@kapso/whatsapp-cloud-api', () => ({
  WhatsAppClient: class {
    messages = { sendText: mockSendText };
  },
}));

vi.mock('../../src/config.js', () => ({
  KAPSO_API_KEY: 'test-kapso-key',
  KAPSO_WEBHOOK_SECRET: 'test-webhook-secret',
}));

// ── Helpers ──────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-webhook-secret';

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
  handleMessage = vi.fn().mockResolvedValue('OK logged'),
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

  await app.register(webhookPlugin, { handleMessage });
  return { app, handleMessage };
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
    const handler = vi.fn().mockResolvedValue('Logged S/35.00');
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
    const handler = vi.fn().mockResolvedValue('Receipt processed');
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
    const handler = vi.fn().mockResolvedValue('Receipt processed');
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
    const handler = vi.fn().mockResolvedValue('reply text');
    mockSendText.mockRejectedValueOnce(new Error('Kapso timeout'));
    const { app } = await buildApp(handler);
    const payload = makePayload();
    const res = await inject(app, payload, sign(payload));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  // ── Duplicate message handling ──────────────────────────────────

  it('skips duplicate messages with same ID', async () => {
    const handler = vi.fn().mockResolvedValue('OK');
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
    const handler = vi.fn().mockResolvedValue('OK');
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
});
