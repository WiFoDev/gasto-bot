import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  BANK_EMAIL_USER_PHONE,
  CRON_SECRET,
  INBOUND_EMAIL_SECRET,
  KAPSO_WEBHOOK_SECRET,
} from './config.js';
import { pingDatabase } from './db.js';
import { formatError, formatUnsupportedMedia } from './formatter.js';
import { isBearerAuthorized, runKeepAlive } from './keep-alive.js';
import { BCP_SENDER, mimeToInboundEmail, parseBcpEmail } from './parse-bank-email.js';
import { sendBotReply, sendWhatsAppText } from './whatsapp.js';
import type {
  BankEmailHandler,
  BotReply,
  InboundMessageType,
  KapsoWebhookPayload,
  MessageHandler,
} from './types.js';

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
  handleBankEmail: BankEmailHandler;
}

/** Bank emails are small; this bounds a forwarded message with inline images. */
const BANK_EMAIL_BODY_LIMIT = 5 * 1024 * 1024;

// ── Plugin ───────────────────────────────────────────────────────

const webhookPlugin: FastifyPluginAsync<WebhookPluginOptions> = async (
  fastify: FastifyInstance,
  opts: WebhookPluginOptions,
) => {
  const { handleMessage, handleBankEmail } = opts;

  // Raw MIME from the Cloudflare Email Worker. text/plain is parsed as a
  // string by Fastify already; message/rfc822 needs its own parser.
  fastify.addContentTypeParser(
    'message/rfc822',
    { parseAs: 'buffer', bodyLimit: BANK_EMAIL_BODY_LIMIT },
    (_request, body, done) => done(null, body),
  );

  // ── Health check ─────────────────────────────────────────────

  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // ── Keep-alive cron ──────────────────────────────────────────
  // Triggered by an external scheduler (GitHub Actions). Touching the DB keeps
  // the Supabase free-tier project from pausing; the request itself keeps the
  // Railway service warm. Always answers 200 on a probe failure so the cron
  // doesn't retry-storm — the per-probe status is in the body.

  fastify.route({
    method: ['GET', 'POST'],
    url: '/cron/keep-alive',
    handler: async (request, reply) => {
      if (!isBearerAuthorized(request.headers.authorization, CRON_SECRET)) {
        console.log(
          JSON.stringify({
            event: 'keep_alive_rejected',
            reason: CRON_SECRET ? 'invalid_token' : 'secret_not_configured',
            timestamp: new Date().toISOString(),
          }),
        );
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const result = await runKeepAlive({ pingDatabase });

      console.log(JSON.stringify({ event: 'keep_alive', ...result }));

      return reply.status(200).send(result);
    },
  });

  // ── Bank email (Phase 6) ─────────────────────────────────────
  // A forwarded BCP card-purchase email → one expense + one WhatsApp message.
  // Always 200 after auth so the forwarder never retry-storms; the outcome is
  // in the body and the logs. Logs never carry the email body.

  fastify.post(
    '/inbound/bank-email',
    { bodyLimit: BANK_EMAIL_BODY_LIMIT },
    async (request, reply) => {
      const log = (event: string, extra: Record<string, unknown> = {}) =>
        console.log(JSON.stringify({ event, ...extra, timestamp: new Date().toISOString() }));

      if (!isBearerAuthorized(request.headers.authorization, INBOUND_EMAIL_SECRET)) {
        log('bank_email_unauthorized', {
          reason: INBOUND_EMAIL_SECRET ? 'invalid_token' : 'secret_not_configured',
        });
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const raw = request.body;
      if (!(typeof raw === 'string' || Buffer.isBuffer(raw)) || raw.length === 0) {
        log('bank_email_rejected', { reason: 'empty_body' });
        return reply.status(200).send({ status: 'rejected' });
      }

      let email;
      try {
        email = await mimeToInboundEmail(raw);
      } catch (err) {
        log('bank_email_rejected', {
          reason: 'invalid_mime',
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(200).send({ status: 'rejected' });
      }

      if (email.from !== BCP_SENDER) {
        log('bank_email_rejected', {
          reason: 'wrong_sender',
          senderDomain: email.from.split('@')[1] ?? null,
        });
        return reply.status(200).send({ status: 'rejected' });
      }

      const tx = parseBcpEmail(email);
      if (!tx) {
        log('bank_email_skipped', { subject: email.subject.slice(0, 120) });
        return reply.status(200).send({ status: 'skipped' });
      }

      const txLog = {
        amount: tx.amount,
        currency: tx.currency,
        merchant: tx.merchant,
        operation_number: tx.operation_number,
      };

      let botReply: BotReply | null;
      try {
        botReply = await handleBankEmail(tx);
      } catch (err) {
        log('bank_email_error', {
          ...txLog,
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(200).send({ status: 'error' });
      }

      if (botReply === null) {
        // Duplicate or no configured user; handleBankEmail logged why.
        return reply.status(200).send({ status: 'ignored' });
      }

      log('bank_email_processed', txLog);

      // Best-effort: the expense is registered even if WhatsApp fails.
      try {
        await sendBotReply(BANK_EMAIL_USER_PHONE!, botReply);
      } catch (err) {
        log('bank_notify_error', {
          ...txLog,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return reply.status(200).send({ status: 'processed' });
    },
  );

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
    let messageType: InboundMessageType;
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
    } else if (
      message.type === 'interactive' &&
      message.interactive?.type === 'button_reply' &&
      message.interactive.button_reply?.id
    ) {
      messageType = 'button';
      content = message.interactive.button_reply.id;
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
        await sendWhatsAppText(phone, formatUnsupportedMedia(), phone_number_id);
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
    let botReply: BotReply;
    try {
      botReply = await handleMessage(phone, messageType, content);
    } catch (err) {
      console.log(
        JSON.stringify({
          event: 'handler_error',
          error: err instanceof Error ? err.message : String(err),
          phone,
          timestamp: new Date().toISOString(),
        }),
      );
      botReply = { text: formatError() };
    }

    // Send reply via Kapso (buttons with text fallback live in whatsapp.ts)
    try {
      await sendBotReply(phone, botReply, phone_number_id);
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
