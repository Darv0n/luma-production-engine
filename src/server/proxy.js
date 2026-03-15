/**
 * API PROXY MIDDLEWARE
 *
 * Forwards POST /api/generate to Anthropic API with server-side key injection.
 * The client NEVER touches the API key — it lives only in process.env.
 *
 * Used as a Vite configureServer middleware in dev.
 * For production: wrap in an Express/Fastify server.
 *
 * @param {string} apiKey — ANTHROPIC_API_KEY loaded by vite.config.js
 */
export function createApiMiddleware(apiKey) {
  return (req, res, next) => {
    if (req.url !== '/generate' || req.method !== 'POST') {
      return next();
    }

    if (!apiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: { message: 'ANTHROPIC_API_KEY is not set. Add it to your .env file.' }
      }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body,
        });

        const data = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Proxy error: ' + e.message } }));
      }
    });
  };
}
