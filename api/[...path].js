// Telegram Bot API relay for Vercel
// Forwards all requests from Spaces/Gateway to api.telegram.org

const https = require('https');
const TELEGRAM_API = 'api.telegram.org';

module.exports = (req, res) => {
  // === CORS headers (helps with debugging) ===
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, PATCH');
  res.setHeader('access-control-allow-headers', 'content-type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // === Reconstruct the Telegram API path ===
  const pathSegments = req.query.path || [];
  const path = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments;
  const queryIndex = req.url.indexOf('?');
  const queryString = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const apiPath = `/${path}${queryString}`;

  // === Connect to Telegram API ===
  const options = {
    hostname: TELEGRAM_API,
    path: apiPath,
    method: req.method,
    headers: {},
  };

  // Collect request body
  const bodyChunks = [];
  req.on('data', (chunk) => bodyChunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(bodyChunks);

    // Forward content-type if present
    if (req.headers['content-type']) {
      options.headers['Content-Type'] = req.headers['content-type'];
    }
    // Forward content-length
    if (body.length > 0) {
      options.headers['Content-Length'] = body.length;
    }

    const proxyReq = https.request(options, (proxyRes) => {
      // Collect response
      const resChunks = [];
      proxyRes.on('data', (chunk) => resChunks.push(chunk));
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode);

        // Forward content-type from Telegram
        if (proxyRes.headers['content-type']) {
          res.setHeader('content-type', proxyRes.headers['content-type']);
        }

        res.send(Buffer.concat(resChunks).toString());
      });
    });

    proxyReq.on('error', (err) => {
      console.error('Relay error:', err.message);
      res.status(502).json({
        ok: false,
        error: `Relay failed to reach Telegram: ${err.message}`,
      });
    });

    // Set a timeout so it doesn't hang forever
    proxyReq.setTimeout(8000, () => {
      proxyReq.destroy();
      res.status(504).json({
        ok: false,
        error: 'Relay timed out connecting to Telegram',
      });
    });

    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
};
