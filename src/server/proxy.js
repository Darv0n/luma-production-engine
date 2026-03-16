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
 *   POST /api/platform/board/create → Create a new board
 *   POST /api/platform/board/:id/generate → Generate on platform board
 *   GET  /api/platform/board/:id/review → Review board (screenshot + statuses)
 *   POST /api/platform/modify       → Modify a generation
 *   POST /api/platform/extend       → Extend a generation
 *   GET  /api/platform/generation/status/:id → Full generation status
 *   POST /api/platform/still        → Extract still from generation
 *   GET  /api/platform/download/:id → Download generation video
 *   POST /api/assembly/start        → Start FFmpeg assembly
 *   GET  /api/assembly/status/:id   → Poll assembly progress
 *   GET  /api/assembly/download/:id → Download assembled video
 *   POST /api/dream/start           → Start Dream Machine session
 *   GET  /api/dream/status          → SSE stream for dream session
 *   POST /api/dream/respond         → Human response to check-in
 *   POST /api/dream/pause           → Pause dream session
 *   POST /api/dream/resume          → Resume dream session
 *   POST /api/dream/abort           → Abort dream session
 *   GET  /api/storage/projects      → List all projects (LowDB)
 *   POST /api/storage/projects      → Upsert project
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

      // PATCH /api/storage/dialogues/:projectId/:runId → update dialogue state
      const dialogueMatch = req.url.match(/^\/dialogues\/([^/]+)\/([^/]+)$/);
      if (dialogueMatch && req.method === 'PATCH') {
        readBody((dialogues) => {
          const project = getProject(dialogueMatch[1]);
          if (!project) return json(404, { error: 'Project not found' });
          if (!project.dialogues) project.dialogues = {};
          project.dialogues[dialogueMatch[2]] = dialogues;
          project.updatedAt = new Date().toISOString();
          saveProject(project);
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

    const readBody = (cb) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try { cb(JSON.parse(body)); }
        catch { json(400, { error: 'Invalid JSON' }); }
      });
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

    // GET /api/platform/last-frame/:id → fetch last_frame URL from photon/v2
    const lfMatch = req.url.match(/^\/last-frame\/([^/?]+)/);
    if (lfMatch && req.method === 'GET') {
      (async () => {
        try {
          const { getLastFrame } = await import('./luma-platform.js');
          const url = await getLastFrame(lfMatch[1]);
          json(200, { url });
        } catch (e) { json(500, { error: e.message }); }
      })();
      return;
    }

    // POST /api/platform/reasoning → submit with ray-v3-reasoning model
    if (req.url === '/reasoning' && req.method === 'POST') {
      readBody((payload) => {
        (async () => {
          try {
            const { submitWithReasoning } = await import('./luma-platform.js');
            const result = await submitWithReasoning(payload.shot, payload.keyframeImageUrl);
            json(200, result);
          } catch (e) { json(500, { error: e.message }); }
        })();
      });
      return;
    }

    // POST /api/platform/brainstorm → call platform brainstorm on a generation
    if (req.url === '/brainstorm' && req.method === 'POST') {
      readBody((payload) => {
        (async () => {
          try {
            const { callPlatformBrainstorm } = await import('./luma-platform.js');
            const result = await callPlatformBrainstorm(payload.generationId, payload.boardId);
            json(200, result);
          } catch (e) { json(500, { error: e.message }); }
        })();
      });
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

    // GET /api/platform/screenshot
    if (req.url === '/screenshot' && req.method === 'GET') {
      (async () => {
        try {
          const { captureScreenshot } = await import('./luma-platform.js');
          const result = await captureScreenshot();
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

    // ── Phase 2B: New platform operations ─────────────────────────────────

    // POST /api/platform/board/create
    if (req.url === '/board/create' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { createBoard } = await import('./luma-platform.js');
          const result = await createBoard(payload.name);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // POST /api/platform/board/:id/generate
    const boardGenMatch = req.url.match(/^\/board\/([^/]+)\/generate$/);
    if (boardGenMatch && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { generateOnPlatform } = await import('./luma-platform.js');
          const result = await generateOnPlatform(payload.shot, boardGenMatch[1]);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // GET /api/platform/board/:id/review
    const boardReviewMatch = req.url.match(/^\/board\/([^/]+)\/review$/);
    if (boardReviewMatch && req.method === 'GET') {
      (async () => {
        try {
          const { reviewBoard } = await import('./luma-platform.js');
          const result = await reviewBoard(boardReviewMatch[1]);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      })();
      return;
    }

    // POST /api/platform/modify
    if (req.url === '/modify' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { modifyGeneration } = await import('./luma-platform.js');
          const result = await modifyGeneration(payload.generationId, payload.prompt, payload.boardId);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // POST /api/platform/extend
    if (req.url === '/extend' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { extendGeneration } = await import('./luma-platform.js');
          const result = await extendGeneration(payload.generationId, payload.boardId);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // GET /api/platform/generation/status/:id
    const genStatusMatch = req.url.match(/^\/generation\/status\/([^/?]+)/);
    if (genStatusMatch && req.method === 'GET') {
      (async () => {
        try {
          const { getGenerationStatus } = await import('./luma-platform.js');
          const result = await getGenerationStatus(genStatusMatch[1]);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      })();
      return;
    }

    // POST /api/platform/still
    if (req.url === '/still' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { extractStillFrame } = await import('./luma-platform.js');
          const result = await extractStillFrame(payload.generationId);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // GET /api/platform/download/:id
    const dlMatch = req.url.match(/^\/download\/([^/?]+)/);
    if (dlMatch && req.method === 'GET') {
      (async () => {
        try {
          const { downloadGeneration } = await import('./luma-platform.js');
          const destPath = `data/assembly/downloads/${dlMatch[1]}.mp4`;
          const result = await downloadGeneration(dlMatch[1], destPath);
          json(200, result);
        } catch (e) { json(500, { error: e.message }); }
      })();
      return;
    }

    next();
  };
}

// ─── Assembly middleware ────────────────────────────────────────────────────
export function createAssemblyMiddleware() {
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

    // POST /api/assembly/start
    if (req.url === '/start' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { getProject } = await import('./db.js');
          const { assembleSequence } = await import('./ffmpeg-assembly.js');

          const project = getProject(payload.projectId);
          if (!project) return json(404, { error: 'Project not found' });

          const run = project.runs?.find(r => r.id === payload.runId) || project.runs?.[project.runs.length - 1];
          if (!run) return json(404, { error: 'Run not found' });

          // Build shots with video URLs from draft states
          const shots = (run.shots || []).map((shot, i) => {
            const draft = run.drafts?.[i];
            return {
              videoUrl: draft?.videoUrl || null,
              cutType: shot.cutType || 'hard cut',
              name: shot.name,
            };
          }).filter(s => s.videoUrl);

          if (shots.length === 0) return json(400, { error: 'No completed videos to assemble' });

          // Start assembly async
          assembleSequence(shots, {
            projectId: payload.projectId,
            audioTrackUrl: payload.audioTrackUrl,
          }).catch(() => { /* errors tracked in progress state */ });

          json(200, { started: true, shotCount: shots.length });
        } catch (e) {
          json(500, { error: e.message });
        }
      });
      return;
    }

    // GET /api/assembly/status/:id
    const statusMatch = req.url.match(/^\/status\/([^/?]+)/);
    if (statusMatch && req.method === 'GET') {
      (async () => {
        try {
          const { getAssemblyProgress } = await import('./ffmpeg-assembly.js');
          const progress = getAssemblyProgress(statusMatch[1]);
          json(200, progress || { phase: 'idle', percent: 0 });
        } catch (e) { json(500, { error: e.message }); }
      })();
      return;
    }

    // GET /api/assembly/download/:id
    const dlMatch = req.url.match(/^\/download\/([^/?]+)/);
    if (dlMatch && req.method === 'GET') {
      (async () => {
        try {
          const { getAssemblyOutputPath, hasAssemblyOutput } = await import('./ffmpeg-assembly.js');
          const outputPath = getAssemblyOutputPath(dlMatch[1]);
          if (!hasAssemblyOutput(dlMatch[1])) {
            return json(404, { error: 'Assembly not ready' });
          }
          // Serve file
          const fs = await import('fs');
          const stat = fs.statSync(outputPath);
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="final-${dlMatch[1]}.mp4"`,
          });
          fs.createReadStream(outputPath).pipe(res);
        } catch (e) { json(500, { error: e.message }); }
      })();
      return;
    }

    next();
  };
}

// ─── Dream Machine session middleware ────────────────────────────────────────
export function createDreamMiddleware(anthropicKey) {
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

    // POST /api/dream/start
    if (req.url === '/start' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { getProject } = await import('./db.js');
          const { startDreamSession } = await import('./dream-session.js');

          const project = getProject(payload.projectId);
          if (!project) return json(404, { error: 'Project not found' });

          const run = project.runs?.find(r => r.id === payload.runId) || project.runs?.[project.runs.length - 1];
          if (!run) return json(404, { error: 'Run not found' });

          const settings = {
            ...project.settings?.dreamMachine,
            vision: project.settings?.vision,
          };

          const session = startDreamSession(project, run, settings, anthropicKey);
          json(200, { started: true, projectId: project.id, runId: run.id });
        } catch (e) {
          json(500, { error: e.message });
        }
      });
      return;
    }

    // GET /api/dream/status → SSE stream
    if (req.url.startsWith('/status') && req.method === 'GET') {
      const projectIdMatch = req.url.match(/[?&]projectId=([^&]+)/);
      const projectId = projectIdMatch?.[1] || null;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('\n');

      if (projectId) {
        import('./dream-session.js').then(({ addSSEClient, getSession }) => {
          addSSEClient(projectId, res);

          // Send current state immediately
          const session = getSession(projectId);
          if (session) {
            res.write(`event: state\ndata: ${JSON.stringify(session.getState())}\n\n`);
          }
        });
      }
      return;
    }

    // POST /api/dream/respond
    if (req.url === '/respond' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { getSession } = await import('./dream-session.js');
          const session = getSession(payload.projectId);
          if (!session) return json(404, { error: 'No active session' });

          session.handleResponse(payload.response);
          json(200, { ok: true });
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // POST /api/dream/pause
    if (req.url === '/pause' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { getSession } = await import('./dream-session.js');
          const session = getSession(payload.projectId);
          if (!session) return json(404, { error: 'No active session' });
          session.pause();
          json(200, { ok: true });
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // POST /api/dream/resume
    if (req.url === '/resume' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { getSession } = await import('./dream-session.js');
          const session = getSession(payload.projectId);
          if (!session) return json(404, { error: 'No active session' });
          session.resume();
          json(200, { ok: true });
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    // POST /api/dream/abort
    if (req.url === '/abort' && req.method === 'POST') {
      readBody(async (payload) => {
        try {
          const { getSession } = await import('./dream-session.js');
          const session = getSession(payload.projectId);
          if (!session) return json(404, { error: 'No active session' });
          session.abort();
          json(200, { ok: true });
        } catch (e) { json(500, { error: e.message }); }
      });
      return;
    }

    next();
  };
}
