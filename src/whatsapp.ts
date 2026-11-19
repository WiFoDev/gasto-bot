import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID } from './config.js';
import type { BotReply } from './types.js';

/**
 * Outbound WhatsApp via Kapso. Inbound replies pass the phone number id from
 * the webhook payload; sends with no inbound message (bank emails) use the
 * static `KAPSO_PHONE_NUMBER_ID`.
 */

const client = new WhatsAppClient({
  baseUrl: 'https://api.kapso.ai/meta/whatsapp',
  kapsoApiKey: KAPSO_API_KEY,
});

function resolvePhoneNumberId(phoneNumberId: string | undefined): string {
  const id = phoneNumberId ?? KAPSO_PHONE_NUMBER_ID;
  if (!id) throw new Error('KAPSO_PHONE_NUMBER_ID is not configured');
  return id;
}

/** Sends a plain text message. Throws on failure; callers decide how to log. */
export async function sendWhatsAppText(
  to: string,
  body: string,
  phoneNumberId?: string,
): Promise<void> {
  await client.messages.sendText({
    phoneNumberId: resolvePhoneNumberId(phoneNumberId),
    to,
    body,
  });
}

/**
 * Sends a handler reply: reply buttons when present, plain text otherwise.
 * A failed button send falls back to text so the prompt is never lost
 * (typed "sí"/"no" still works). Throws only if the text send fails.
 */
export async function sendBotReply(
  to: string,
  reply: BotReply,
  phoneNumberId?: string,
): Promise<void> {
  const id = resolvePhoneNumberId(phoneNumberId);

  if (reply.buttons?.length) {
    try {
      await client.messages.sendInteractiveButtons({
        phoneNumberId: id,
        to,
        bodyText: reply.text,
        buttons: reply.buttons,
      });
      return;
    } catch (err) {
      console.log(
        JSON.stringify({
          event: 'kapso_buttons_error',
          error: err instanceof Error ? err.message : String(err),
          phone: to,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  await sendWhatsAppText(to, reply.text, id);
}
