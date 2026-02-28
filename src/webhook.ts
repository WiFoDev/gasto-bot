import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { KAPSO_API_KEY, KAPSO_WEBHOOK_SECRET } from './config.js';
import { formatUnsupportedMedia } from './formatter.js';
import type { KapsoWebhookPayload, MessageHandler } from './types.js';

// ── Deduplication ───────────────────────────────────────────────

const DEDUP_MAX_SIZE = 1000;
const recentMessageIds = new Set<string>();

function isDuplicate(messageId: string): boolean {
  if (recentMessageIds.has(messageId)) return true;
  recentMessageIds.add(messageId);
  // Evict oldest entries when set grows too large
  if (recentMessageIds.size > DEDUP_MAX_SIZE) {
    const first = recentMessageIds.values().next().value!;
    recentMessageIds.delete(first);
  }
  return false;
}

// Exported for testing
export { recentMessageIds };

// ── Plugin options ───────────────────────────────────────────────

export interface WebhookPluginOptions {
  handleMessage: MessageHandler;
}

// ── Plugin ───────────────────────────────────────────────────────

const webhookPlugin: FastifyPluginAsync<WebhookPluginOptions> = async (
  fastify: FastifyInstance,
  opts: WebhookPluginOptions,
) => {
  const { handleMessage } = opts;

  const kapsoClient = new WhatsAppClient({
    baseUrl: 'https://api.kapso.ai/meta/whatsapp',
    kapsoApiKey: KAPSO_API_KEY,
  });

  // ── Health check ─────────────────────────────────────────────

  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // ── Webhook ──────────────────────────────────────────────────

  fastify.post('/webhook', async (request, reply) => {
    // Verify webhook signature per Kapso docs:
    // HMAC-SHA256 of JSON.stringify(body) with webhook secret, compared as hex
    const signature = request.headers['x-webhook-signature'] as
      | string
      | undefined;

    if (!signature) {
      console.log(
        JSON.stringify({
          event: 'webhook_rejected',
          reason: 'missing_signature',
          timestamp: new Date().toISOString(),
        }),
      );
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    // Use the raw body bytes for HMAC — NOT JSON.stringify(request.body).
    // Kapso signs the exact bytes it sends; re-serializing the parsed object
    // can change key order, whitespace, or number formatting and break the match.
    const rawBody = (request as any).rawBody as Buffer | undefined;
    const bodyForHmac = rawBody ?? Buffer.from(JSON.stringify(request.body));

    const expected = crypto
      .createHmac('sha256', KAPSO_WEBHOOK_SECRET)
      .update(bodyForHmac)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);

    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      console.log(
        JSON.stringify({
          event: 'webhook_rejected',
          reason: 'invalid_signature',
          bodyLength: bodyForHmac.length,
          hasRawBody: !!rawBody,
          timestamp: new Date().toISOString(),
        }),
      );
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const payload = request.body as KapsoWebhookPayload;

    // Validate required fields
    if (
      !payload.message ||
      !payload.conversation?.phone_number ||
      !payload.phone_number_id
    ) {
      console.log(
        JSON.stringify({
          event: 'webhook_rejected',
          reason: 'missing_fields',
          timestamp: new Date().toISOString(),
        }),
      );
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const { message, conversation, phone_number_id } = payload;
    const phone = conversation.phone_number;

    // Skip outbound messages
    if (message.kapso?.direction && message.kapso.direction !== 'inbound') {
      return reply.status(200).send({ status: 'skipped' });
    }

    // Skip duplicate messages
    if (message.id && isDuplicate(message.id)) {
      console.log(
        JSON.stringify({
          event: 'webhook_skipped',
          reason: 'duplicate',
          messageId: message.id,
          phone,
          timestamp: new Date().toISOString(),
        }),
      );
      return reply.status(200).send({ status: 'duplicate' });
    }

    // Determine message type and content
    let messageType: 'text' | 'image';
    let content: string;

    if (message.type === 'text' && message.text?.body) {
      messageType = 'text';
      content = message.text.body;
    } else if (message.type === 'image') {
      messageType = 'image';
      content =
        message.kapso?.mediaUrl ??
        message.kapso?.mediaData?.url ??
        message.image?.link ??
        message.image?.id ??
        '';
    } else {
      // Unsupported message type — reply with a helpful message
      console.log(
        JSON.stringify({
          event: 'webhook_skipped',
          reason: 'unsupported_type',
          messageType: message.type,
          phone,
          timestamp: new Date().toISOString(),
        }),
      );
      try {
        await kapsoClient.messages.sendText({
          phoneNumberId: phone_number_id,
          to: phone,
          body: formatUnsupportedMedia(),
        });
      } catch {
        // Best-effort reply
      }
      return reply.status(200).send({ status: 'unsupported_type' });
    }

    // Skip empty content
    if (!content.trim()) {
      return reply.status(200).send({ status: 'empty_message' });
    }

    console.log(JSON.stringify({
      event: 'webhook',
      phone,
      messageType,
      messageId: message.id,
      timestamp: new Date().toISOString(),
    }));

    // Process message through handler
    let responseText: string;
    try {
      responseText = await handleMessage(phone, messageType, content);
    } catch (err) {
      console.log(
        JSON.stringify({
          event: 'handler_error',
          error: err instanceof Error ? err.message : String(err),
          phone,
          timestamp: new Date().toISOString(),
        }),
      );
      responseText = 'Something went wrong, try again.';
    }

    // Send reply via Kapso
    try {
      await kapsoClient.messages.sendText({
        phoneNumberId: phone_number_id,
        to: phone,
        body: responseText,
      });
    } catch (err) {
      console.log(
        JSON.stringify({
          event: 'kapso_send_error',
          error: err instanceof Error ? err.message : String(err),
          phone,
          timestamp: new Date().toISOString(),
        }),
      );
      // Can't reply to user — just log
    }

    return reply.status(200).send({ status: 'ok' });
  });
};

export default webhookPlugin;
