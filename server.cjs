/* eslint-disable @typescript-eslint/no-require-imports */
// Load .env.local in development; no-op when file is absent (production)
require('dotenv').config({ path: '.env.local' });

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const app = express();
app.use(express.json());

// ─── CORS ────────────────────────────────────────────────────────────────────
// Allow localhost (dev) + the deployed Vercel frontend (set FRONTEND_URL in env)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5175',
  process.env.FRONTEND_URL,         // e.g. https://nirvana-retirement.vercel.app
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (curl, Postman, same-origin SSR)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    }
  },
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// 10 requests per IP per hour to cap accidental or abusive API spend
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded — maximum 10 requests per hour. Try again later.' },
});

// ─── Proxy endpoint ───────────────────────────────────────────────────────────
app.post('/api/generate', limiter, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':           apiKey,
        'anthropic-version':   '2023-06-01',
        'content-type':        'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[proxy] Upstream fetch failed:', err.message);
    res.status(502).json({ error: 'Upstream request to Anthropic failed.', detail: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[proxy] Listening on http://localhost:${PORT}`);
});
