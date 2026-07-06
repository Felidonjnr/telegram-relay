const https = require('https');
const TELEGRAM_API = 'api.telegram.org';

module.exports = (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, PATCH');
  res.setHeader('access-control-allow-headers', 'content-type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiPath = '/' + (req.query._path || '');
  const { _path, ...telegramParams } = req.query;
  const queryParts = [];
  for (const [key, value] of Object.entries(telegramParams)) {
    queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  const queryString = queryParts.length > 0 ? '?' + queryParts.join('&') : '';
  const fullPath = apiPath + queryString;

  const bodyChunks = [];
  req.on('data', (chunk) => bodyChunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(bodyChunks);
    const hasBody = body.length > 0;

    const options = {
      hostname: TELEGRAM_API,
      path: fullPath,
      method: req.method,
      headers: {},
    };

    if (hasBody && req.headers['content-type']) {
      options.headers['Content-Type'] = req.headers['content-type'];
    }
    if (hasBody) {
      options.headers['Content-Length'] = body.length;
    }

    const proxyReq = https.request(options, (proxyRes) => {
      const resChunks = [];
      proxyRes.on('data', (chunk) => resChunks.push(chunk));
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode);
        if (proxyRes.headers['content-type']) {
          res.setHeader('content-type', proxyRes.headers['content-type']);
        }
        res.send(Buffer.concat(resChunks).toString());
      });
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({ ok: false, error: `Relay failed: ${err.message}` });
    });

    proxyReq.setTimeout(8000, () => {
      proxyReq.destroy();
      res.status(504).json({ ok: false, error: 'Relay timed out' });
    });

    if (hasBody) proxyReq.write(body);
    proxyReq.end();
  });
};
