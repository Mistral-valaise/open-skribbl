import { createServer, type Server } from 'node:http';

/**
 * Creates the HTTP server. Milestone M0 serves the health endpoint only; the
 * API, static files and the WebSocket gateway arrive in M1
 * (docs/ARCHITECTURE.md §6).
 */
export function createApp(): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
}
