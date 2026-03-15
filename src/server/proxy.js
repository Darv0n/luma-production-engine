/**
 * API PROXY MIDDLEWARE
 *
 * Forwards API calls with server-side key injection.
 * The client NEVER touches any API key — they live only in process.env.
 *
 * Routes:
 *   POST /api/generate              → Anthropic API
 *   POST /api/luma/generate         → Luma Dream Machine video create
 *   GET  /api/luma/status/:id       → Luma generation status poll
 *   GET  /api/platform/session      → Check Dream Machine login status
 *   POST /api/platform/login        → Open browser for user to log in
 *   POST /api/platform/char-ref     → Submit char ref video via Playwright automation
 *   GET  /api/storage/projects      → List all projects (LowDB)
 *   GET  /api/storage/projects/:id  → Get single project
 *   POST /api/storage/projects      → Upsert project
 *   DELETE /api/storage/projects/:id → Delete project
 *   POST /api/storage/runs/:id      → Append run to project
 *   POST /api/storage/import        → Bulk import (localStorage migration)
 *
 * Used as Vite configureServer middleware in dev.
 * For production: wrap in an Express/Fastify server.
 */

const LUMA_BASE = 'https://api.lumalabs.ai/dream-machine/v1';

// ─── Anthropic proxy ──────────────────────────────────────────────────────────
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

// ─── Luma proxy ───────────────────────────────────────────────────────────────
export function createLumaMiddleware(lumaKey) {
  return (req, res, next) => {
    if (!lumaKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: { message: 'LUMA_API_KEY is not set. Add it to your .env file.' }
      }));
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lumaKey}`,
    };

    // POST /api/luma/generate → POST /generations/video
    if (req.url === '/generate' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const upstream = await fetch(`${LUMA_BASE}/generations/video`, {
            method: 'POST',
            headers,
            body,
          });
          const data = await upstream.text();
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Luma proxy error: ' + e.message } }));
        }
      });
      return;
    }

    // GET /api/luma/status/:id → GET /generations/:id
    const statusMatch = req.url.match(/^\/status\/([^/?]+)/);
    if (statusMatch && req.method === 'GET') {
      const id = statusMatch[1];
      (async () => {
        try {
          const upstream = await fetch(`${LUMA_BASE}/generations/${id}`, { headers });
          const data = await upstream.text();
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Luma proxy error: ' + e.message } }));
        }
      })();
      return;
    }

    // POST /api/luma/image → POST /generations/image (Photon keyframe design)
    if (req.url === '/image' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const upstream = await fetch(`${LUMA_BASE}/generations/image`, {
            method: 'POST', headers, body,
          });
          const data = await upstream.text();
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Luma proxy error: ' + e.message } }));
        }
      });
      return;
    }

    // POST /api/luma/audio/:id → POST /generations/:id/audio
    const audioMatch = req.url.match(/^\/audio\/([^/?]+)/);
    if (audioMatch && req.method === 'POST') {
      const id = audioMatch[1];
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const upstream = await fetch(`${LUMA_BASE}/generations/${id}/audio`, {
            method: 'POST', headers, body,
          });
          const data = await upstream.text();
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Luma proxy error: ' + e.message } }));
        }
      });
      return;
    }

    // POST /api/luma/upscale/:id → POST /generations/:id/upscale
    const upscaleMatch = req.url.match(/^\/upscale\/([^/?]+)/);
    if (upscaleMatch && req.method === 'POST') {
      const id = upscaleMatch[1];
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const upstream = await fetch(`${LUMA_BASE}/generations/${id}/upscale`, {
            method: 'POST', headers, body,
          });
          const data = await upstream.text();
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(data);
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Luma proxy error: ' + e.message } }));
        }
      });
      return;
    }

    next();
  };
}

// ─── Storage middleware (LowDB) ───────────────────────────────────────────────
export function createStorageMiddleware() {
  return (req, res, next) => {
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const readBody = (cb) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try { cb(JSON.parse(body)); }
        catch { json(400, { error: 'Invalid JSON' }); }
      });
    };

    (async () => {
      const { getProjects, getProject, saveProject, deleteProject, addRun, importProjects } =
        await import('./db.js');

      // GET /api/storage/projects
      if (req.url === '/projects' && req.method === 'GET') {
        json(200, getProjects());
        return;
      }

      // GET /api/storage/projects/:id
      const getMatch = req.url.match(/^\/projects\/([^/]+)$/);
      if (getMatch && req.method === 'GET') {
        const p = getProject(getMatch[1]);
        return p ? json(200, p) : json(404, { error: 'Not found' });
      }

      // POST /api/storage/projects → upsert
      if (req.url === '/projects' && req.method === 'POST') {
        readBody((project) => {
          saveProject(project);
          json(200, project);
        });
        return;
      }

      // DELETE /api/storage/projects/:id
      const delMatch = req.url.match(/^\/projects\/([^/]+)$/);
      if (delMatch && req.method === 'DELETE') {
        deleteProject(delMatch[1]);
        json(200, { ok: true });
        return;
      }

      // POST /api/storage/runs/:projectId → append run
      const runMatch = req.url.match(/^\/runs\/([^/]+)$/);
      if (runMatch && req.method === 'POST') {
        readBody((run) => {
          addRun(runMatch[1], run);
          json(200, { ok: true });
        });
        return;
      }

      // POST /api/storage/import → bulk import (localStorage migration)
      if (req.url === '/import' && req.method === 'POST') {
        readBody((projectMap) => {
          importProjects(projectMap);
          json(200, { imported: Object.keys(projectMap).length });
        });
        return;
      }

      next();
    })();
  };
}
// ─── Platform automation middleware ───────────────────────────────────────────
export function createPlatformMiddleware() {
  return (req, res, next) => {
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    // GET /api/platform/session
    if (req.url === '/session' && req.method === 'GET') {
      (async () => {
        try {
          const { checkSession } = await import('./luma-platform.js');
          const result = await checkSession();
          json(200, result);
        } catch (e) {
          json(500, { error: e.message });
        }
      })();
      return;
    }

    // POST /api/platform/login
    if (req.url === '/login' && req.method === 'POST') {
      (async () => {
        try {
          const { openLoginBrowser } = await import('./luma-platform.js');
          const result = await openLoginBrowser();
          json(200, result);
        } catch (e) {
          json(500, { error: e.message });
        }
      })();
      return;
    }

    // POST /api/platform/char-ref
    if (req.url === '/char-ref' && req.method === 'POST') {
      let body = Buffer.alloc(0);
      req.on('data', (chunk) => { body = Buffer.concat([body, chunk]); });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body.toString());
          const { shot, imageBase64, imageExt } = payload;

          if (!shot || !imageBase64) {
            return json(400, { error: 'shot and imageBase64 are required' });
          }

          const imageBuffer = Buffer.from(imageBase64, 'base64');
          const { submitCharRefVideo } = await import('./luma-platform.js');
          const result = await submitCharRefVideo(shot, imageBuffer, imageExt || 'jpg');
          json(200, result);
        } catch (e) {
          json(500, { error: e.message });
        }
      });
      return;
    }

    next();
  };
}
