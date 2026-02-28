import Fastify from 'fastify';
import webhookPlugin from './webhook.js';
import { handleMessage } from './handler.js';
import { PORT } from './config.js';

const server = Fastify();

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

await server.register(webhookPlugin, { handleMessage });

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
