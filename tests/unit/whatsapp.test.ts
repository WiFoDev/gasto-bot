import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const { mockSendText, mockSendInteractiveButtons, mockConfig, clientOptions } = vi.hoisted(() => ({
  mockSendText: vi.fn(),
  mockSendInteractiveButtons: vi.fn(),
  mockConfig: {
    KAPSO_API_KEY: 'test-kapso-key',
    KAPSO_PHONE_NUMBER_ID: 'pn_static' as string | undefined,
  },
  clientOptions: [] as unknown[],
}));

vi.mock('@kapso/whatsapp-cloud-api', () => ({
  WhatsAppClient: class {
    constructor(opts: unknown) {
      clientOptions.push(opts);
    }
    messages = {
      sendText: mockSendText,
      sendInteractiveButtons: mockSendInteractiveButtons,
    };
  },
}));

vi.mock('../../src/config.js', () => ({
  get KAPSO_API_KEY() {
    return mockConfig.KAPSO_API_KEY;
  },
  get KAPSO_PHONE_NUMBER_ID() {
    return mockConfig.KAPSO_PHONE_NUMBER_ID;
  },
}));

import { sendWhatsAppText, sendBotReply } from '../../src/whatsapp.js';

const PHONE = '+51999888777';

beforeEach(() => {
  mockSendText.mockReset().mockResolvedValue({ messages: [{ id: 'wamid.text' }] });
  mockSendInteractiveButtons.mockReset().mockResolvedValue({ messages: [{ id: 'wamid.btn' }] });
  mockConfig.KAPSO_PHONE_NUMBER_ID = 'pn_static';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('WhatsApp client', () => {
  it('is built once against the Kapso proxy with the API key', () => {
    expect(clientOptions).toEqual([
      { baseUrl: 'https://api.kapso.ai/meta/whatsapp', kapsoApiKey: 'test-kapso-key' },
    ]);
  });
});

describe('sendWhatsAppText', () => {
  it('sends from the configured KAPSO_PHONE_NUMBER_ID by default', async () => {
    await sendWhatsAppText(PHONE, 'hola');
    expect(mockSendText).toHaveBeenCalledWith({
      phoneNumberId: 'pn_static',
      to: PHONE,
      body: 'hola',
    });
  });

  it('uses an explicit phone number id when given (inbound replies)', async () => {
    await sendWhatsAppText(PHONE, 'hola', 'pn_from_payload');
    expect(mockSendText).toHaveBeenCalledWith({
      phoneNumberId: 'pn_from_payload',
      to: PHONE,
      body: 'hola',
    });
  });

  it('throws without calling Kapso when no phone number id is available', async () => {
    mockConfig.KAPSO_PHONE_NUMBER_ID = undefined;
    await expect(sendWhatsAppText(PHONE, 'hola')).rejects.toThrow(/KAPSO_PHONE_NUMBER_ID/);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('propagates Kapso errors to the caller', async () => {
    mockSendText.mockRejectedValueOnce(new Error('kapso down'));
    await expect(sendWhatsAppText(PHONE, 'hola')).rejects.toThrow('kapso down');
  });
});

describe('sendBotReply', () => {
  const buttons = [
    { id: 'yes', title: 'Sí' },
    { id: 'no', title: 'No' },
  ];

  it('sends plain text when the reply has no buttons', async () => {
    await sendBotReply(PHONE, { text: 'listo' }, 'pn_1');
    expect(mockSendText).toHaveBeenCalledWith({ phoneNumberId: 'pn_1', to: PHONE, body: 'listo' });
    expect(mockSendInteractiveButtons).not.toHaveBeenCalled();
  });

  it('treats an empty buttons array as plain text', async () => {
    await sendBotReply(PHONE, { text: 'listo', buttons: [] }, 'pn_1');
    expect(mockSendText).toHaveBeenCalledOnce();
    expect(mockSendInteractiveButtons).not.toHaveBeenCalled();
  });

  it('sends reply buttons when present', async () => {
    await sendBotReply(PHONE, { text: '¿Crear categoría?', buttons }, 'pn_1');
    expect(mockSendInteractiveButtons).toHaveBeenCalledWith({
      phoneNumberId: 'pn_1',
      to: PHONE,
      bodyText: '¿Crear categoría?',
      buttons,
    });
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('falls back to plain text when the button send fails', async () => {
    mockSendInteractiveButtons.mockRejectedValueOnce(new Error('bad buttons'));
    await sendBotReply(PHONE, { text: '¿Crear categoría?', buttons }, 'pn_1');
    expect(mockSendText).toHaveBeenCalledWith({
      phoneNumberId: 'pn_1',
      to: PHONE,
      body: '¿Crear categoría?',
    });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('kapso_buttons_error'));
  });

  it('defaults to the configured phone number id', async () => {
    await sendBotReply(PHONE, { text: 'listo' });
    expect(mockSendText).toHaveBeenCalledWith({ phoneNumberId: 'pn_static', to: PHONE, body: 'listo' });
  });

  it('propagates a failed text send', async () => {
    mockSendText.mockRejectedValueOnce(new Error('kapso down'));
    await expect(sendBotReply(PHONE, { text: 'listo' }, 'pn_1')).rejects.toThrow('kapso down');
  });
});
