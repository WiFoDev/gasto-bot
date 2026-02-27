import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { verifySignature } from '@kapso/whatsapp-cloud-api/server';
import { KAPSO_API_KEY, KAPSO_WEBHOOK_SECRET } from './config.js';
import type { KapsoWebhookPayload, MessageHandler } from './types.js';

// ── Plugin options ───────────────────────────────────────────────

export interface WebhookPluginOptions {
  handleMessage: MessageHandler;
}

// ── Augment Fastify request for raw body ─────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
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

  // Capture raw body within this plugin scope for signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      req.rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString()));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── Health check ─────────────────────────────────────────────

  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // ── Webhook ──────────────────────────────────────────────────

  fastify.post('/webhook', async (request, reply) => {
    // Verify signature (check both Kapso and Meta header names)
    const signature =
      (request.headers['x-webhook-signature'] as string | undefined) ??
      (request.headers['x-hub-signature-256'] as string | undefined);

    if (
      !verifySignature({
        appSecret: KAPSO_WEBHOOK_SECRET,
        rawBody: request.rawBody!,
        signatureHeader: signature,
      })
    ) {
      console.log(
        JSON.stringify({
          event: 'webhook_rejected',
          reason: 'invalid_signature',
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
      // Unsupported message type — acknowledge but don't process
      console.log(
        JSON.stringify({
          event: 'webhook_skipped',
          reason: 'unsupported_type',
          messageType: message.type,
          phone,
          timestamp: new Date().toISOString(),
        }),
      );
      return reply.status(200).send({ status: 'unsupported_type' });
    }

    // Skip empty content
    if (!content.trim()) {
      return reply.status(200).send({ status: 'empty_message' });
    }

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
