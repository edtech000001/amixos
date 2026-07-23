import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { authRouter } from './routes/auth';
import { businessRouter } from './routes/business';
import { employeeRouter } from './routes/employee';
import { invoiceRouter } from './routes/invoice';
import { clientRouter } from './routes/client';
import { timesheetRouter } from './routes/timesheet';
import { dashboardRouter } from './routes/dashboard';
import { googleSyncRouter } from './routes/googleSync';
import { invitesRouter } from './routes/invites';
import { adminRouter } from './routes/admin';
import { mapRouter } from './routes/map';
import { weatherRouter } from './routes/weather';
import { smsRouter } from './routes/sms';
import { assistantRouter } from './routes/assistant';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security & Middleware
app.use(helmet());

// Cloud Run sits behind exactly one Google front-end proxy hop, so trust a
// single proxy. This makes req.ip resolve to the real client IP (from the
// last X-Forwarded-For entry) instead of the proxy's, which the per-IP rate
// limiters below rely on.
app.set('trust proxy', 1);

// Global rate limit, per client IP. A backstop against scraping/brute-force on
// every route; expensive routes (e.g. SMS send) layer a stricter cap on top.
// NOTE: this is per-instance — on multi-instance Cloud Run, move to a shared
// store (Redis) for an exact global cap.
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// CORS allowlist. FRONTEND_URL stays the single canonical app URL (used to
// build invite links elsewhere); browser origins allowed to call the API come
// from FRONTEND_URL + CORS_ALLOWED_ORIGINS (comma-separated) + localhost for
// dev. Vercel preview deploys are matched only when CORS_VERCEL_PREVIEW_PREFIX
// is set (e.g. "amixos"), and only for `https://<prefix>…​.vercel.app` — never
// the whole of *.vercel.app, which anyone can deploy to.
const corsAllowlist = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? []),
  'http://localhost:3000',
]
  .map((o) => o?.trim())
  .filter((o): o is string => Boolean(o));

const previewPrefix = process.env.CORS_VERCEL_PREVIEW_PREFIX?.trim();
const vercelPreview =
  previewPrefix && previewPrefix.length > 0
    ? new RegExp(`^https://${previewPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9-]*\\.vercel\\.app$`)
    : null;

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header → non-browser client (mobile, curl, server-to-server).
      // Not subject to browser CORS, so allow it through.
      if (!origin) return callback(null, true);
      if (corsAllowlist.includes(origin) || (vercelPreview && vercelPreview.test(origin))) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'amixos-api' }));

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/business', businessRouter);
app.use('/api/v1/employees', employeeRouter);
app.use('/api/v1/invoices', invoiceRouter);
app.use('/api/v1/clients', clientRouter);
app.use('/api/v1/timesheet', timesheetRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/google-sync', googleSyncRouter);
app.use('/api/v1/invites', invitesRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/map', mapRouter);
app.use('/api/v1/weather', weatherRouter);
app.use('/api/v1/sms', smsRouter);
app.use('/api/v1/assistant', assistantRouter);

// Error handling
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Amixos API running on port ${PORT}`);
});

export default app;
