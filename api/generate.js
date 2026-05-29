// Vercel serverless function — POST /api/generate
// Proxies requests to the Anthropic API using the server-side API key.

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// NOTE: serverless functions can have multiple warm instances, so this provides
// per-instance rate limiting. For strict multi-instance enforcement, replace
// with Upstash Redis (@upstash/ratelimit + @upstash/redis).
const rateMap = new Map();
const WINDOW_MS    = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 10;

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Only accept POST
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate-limit by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Rate limit exceeded — maximum 10 requests per hour. Try again later.',
    });
  }

  // Require API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[api/generate] Upstream fetch failed:', err.message);
    return res.status(502).json({
      error:  'Upstream request to Anthropic failed.',
      detail: err.message,
    });
  }
}
