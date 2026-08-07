import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT } from './db.js';
import { errorHandler, router } from './routes.js';
import { seedDemoData } from './seed.js';
import { ANALYZER_VERSION } from './analyzer/index.js';

const PORT = Number(process.env.PORT ?? 4180);
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, analyzerVersion: ANALYZER_VERSION, uptime: process.uptime() });
});

// Express 4 does not await async handlers, so rejections are forwarded manually.
const asyncRouter = express.Router();
asyncRouter.use((req, res, next) => {
  const originalNext = next;
  Promise.resolve()
    .then(() => new Promise<void>((resolve, reject) => router(req, res, (err?: unknown) => (err ? reject(err) : resolve()))))
    .then(() => originalNext())
    .catch(originalNext);
});
app.use('/api', asyncRouter);
app.use(errorHandler);

// Serve the built client when it exists; in dev, Vite serves it on its own port.
const webDist = path.join(APP_ROOT, 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

seedDemoData();

app.listen(PORT, () => {
  console.log(`Great Lakes Label — Artwork Intelligence & Approval`);
  console.log(`  analyzer   v${ANALYZER_VERSION}`);
  console.log(`  API        http://localhost:${PORT}/api`);
  console.log(
    fs.existsSync(webDist)
      ? `  app        http://localhost:${PORT}`
      : `  app        run "npm run dev" for the Vite client, or "npm run build" to serve it from here`,
  );
});
