/**
 * GastoBot bank-email forwarder (Cloudflare Email Worker, no deps).
 *
 * Gmail auto-forwards BCP purchase notifications to an Email Routing address
 * bound to this Worker; it POSTs the raw MIME to the bot. Only mail whose
 * envelope sender is the user's own Gmail is accepted, since the bot trusts
 * the email content. The bot always answers 200 after auth, so this never
 * retries; failures are visible with `wrangler tail`.
 *
 * Secrets (wrangler secret put): INBOUND_URL, INBOUND_EMAIL_SECRET, ALLOWED_FORWARDER
 */

const MAX_BYTES = 1024 * 1024;

/** Exact address, or Gmail's auto-forward envelope `local+caf_…@domain`. */
function isAllowedForwarder(from, allowed) {
  if (!allowed) return false;
  const sender = from.toLowerCase();
  const [local, domain] = allowed.toLowerCase().split('@');
  if (!local || !domain) return false;
  if (sender === `${local}@${domain}`) return true;
  return sender.startsWith(`${local}+caf_`) && sender.endsWith(`@${domain}`) &&
    sender.lastIndexOf('@') === sender.length - domain.length - 1;
}

export default {
  async email(message, env) {
    if (!isAllowedForwarder(message.from, env.ALLOWED_FORWARDER)) {
      console.log(JSON.stringify({ event: 'rejected', reason: 'sender' }));
      message.setReject('Sender not allowed');
      return;
    }
    if (message.rawSize > MAX_BYTES) {
      console.log(JSON.stringify({ event: 'rejected', reason: 'too_large', size: message.rawSize }));
      message.setReject('Message too large');
      return;
    }

    const body = await new Response(message.raw).arrayBuffer();
    try {
      const res = await fetch(env.INBOUND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.INBOUND_EMAIL_SECRET}`,
          'content-type': 'message/rfc822',
        },
        body,
      });
      console.log(JSON.stringify({ event: 'forwarded', status: res.status, result: (await res.text()).slice(0, 100) }));
    } catch (err) {
      console.log(JSON.stringify({ event: 'forward_failed', error: String(err) }));
    }
  },
};
