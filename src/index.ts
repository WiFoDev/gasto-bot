import { Readable } from 'node:stream';
import Fastify from 'fastify';
import webhookPlugin from './webhook.js';
import { handleBankEmail, handleMessage } from './handler.js';
import { PORT } from './config.js';

const server = Fastify();

// Capture raw body for webhook signature verification.
// Kapso signs the raw bytes — we must HMAC the same bytes, not re-serialized JSON.
server.addHook('preParsing', async (request, _reply, payload) => {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks);
  (request as any).rawBody = rawBody;
  return Readable.from(rawBody);
});

server.setErrorHandler((error: Error, _request, reply) => {
  const statusCode = 'statusCode' in error ? (error as { statusCode: number }).statusCode : 500;
  console.log(JSON.stringify({
    event: 'uncaught_route_error',
    error: error.message,
    statusCode,
    timestamp: new Date().toISOString(),
  }));
  reply.status(500).send({ error: 'Internal server error' });
});

await server.register(webhookPlugin, { handleMessage, handleBankEmail });

await server.listen({ port: PORT, host: '0.0.0.0' });

console.log(
  JSON.stringify({
    event: 'startup',
    message: `gasto-bot listening on port ${PORT}`,
    port: PORT,
    timestamp: new Date().toISOString(),
  }),
);

// ── Graceful shutdown ───────────────────────────────────────────

function shutdown(signal: string) {
  console.log(
    JSON.stringify({
      event: 'shutdown',
      signal,
      timestamp: new Date().toISOString(),
    }),
  );
  server.close().then(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
