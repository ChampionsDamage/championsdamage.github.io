/* Minimal static file server for the built site (dist/). Used for local preview. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 4178;
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.svg':'image/svg+xml', '.xml':'application/xml',
  '.webmanifest':'application/manifest+json', '.txt':'text/plain', '.png':'image/png' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, u);
  try {
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  } catch (e) { res.writeHead(404); return res.end('404'); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT, () => console.log('Preview server on http://localhost:' + PORT));
