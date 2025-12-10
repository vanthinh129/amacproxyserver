const http = require('http');
const net = require('net');
const url = require('url');

// Parse Proxy-Authorization header
function parseProxyAuth(req) {
  const header = req.headers['proxy-authorization'];
  if (!header) return null;

  const match = header.match(/^Basic (.+)$/);
  if (!match) return null;

  const credentials = Buffer.from(match[1], 'base64').toString();
  const index = credentials.indexOf(':');

  if (index === -1) return null;

  return {
    name: credentials.slice(0, index),
    pass: credentials.slice(index + 1)
  };
}

class ProxyServerByUsername {
  constructor(config) {
    this.config = config;
    this.server = null;
    this.proxyMap = new Map(); // username -> proxyInfo
    this.proxyList = [];
    this.port = config.port || 11000;
    this.password = config.password || 'mypass';
    this.usernamePrefix = config.usernamePrefix || 'proxy';
  }

  updateProxies(proxies) {
    console.log(`[ProxyServer] Updating proxy map with ${proxies.length} proxies...`);

    this.proxyList = proxies;
    this.proxyMap.clear();

    proxies.forEach((proxyInfo, index) => {
      const username = `${this.usernamePrefix}${index + 1}`;
      this.proxyMap.set(username, {
        ...proxyInfo,
        index: index + 1,
        username: username
      });
    });

    console.log(`[ProxyServer] ✓ Proxy map updated: ${this.proxyMap.size} entries`);
    console.log(`[ProxyServer] Available usernames: ${this.usernamePrefix}1 - ${this.usernamePrefix}${proxies.length}`);
  }

  getProxyByUsername(username) {
    return this.proxyMap.get(username);
  }

  start() {
    if (this.server) {
      console.log('[ProxyServer] Server already running');
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.server.on('connect', (req, clientSocket, head) => {
      this.handleHttpsConnect(req, clientSocket, head);
    });

    this.server.on('error', (err) => {
      console.error('[ProxyServer] Server error:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`[ProxyServer] Port ${this.port} is already in use!`);
        console.error(`[ProxyServer] Try: lsof -i :${this.port} or netstat -tulpn | grep ${this.port}`);
        process.exit(1);
      }
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[ProxyServer] ✓ Server listening on 0.0.0.0:${this.port}`);
      console.log(`[ProxyServer] Handling ${this.proxyMap.size} proxies via username authentication`);
    });
  }

  handleHttpRequest(req, res) {
    const credentials = parseProxyAuth(req);

    if (!credentials) {
      res.writeHead(407, {
        'Proxy-Authenticate': 'Basic realm="Proxy Server"',
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({
        error: 'Proxy Authentication Required',
        usage: `Use format: http://${this.usernamePrefix}N:${this.password}@host:port`,
        example: `curl -x http://${this.usernamePrefix}1:${this.password}@localhost:${this.port} http://ipinfo.io`
      }));
      return;
    }

    if (credentials.pass !== this.password) {
      res.writeHead(407, {
        'Proxy-Authenticate': 'Basic realm="Proxy Server"',
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({
        error: 'Invalid password'
      }));
      return;
    }

    const proxyInfo = this.getProxyByUsername(credentials.name);

    if (!proxyInfo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Proxy not found',
        username: credentials.name,
        available: `${this.usernamePrefix}1 - ${this.usernamePrefix}${this.proxyList.length}`
      }));
      return;
    }

    const parsedUrl = url.parse(req.url);
    const targetHost = parsedUrl.hostname;

    if (!targetHost) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request URL' }));
      return;
    }

    console.log(`[HTTP] [${credentials.name}] ${req.method} ${req.url} via ${proxyInfo.proxy} (${proxyInfo.isp})`);

    const proxyReq = http.request({
      host: proxyInfo.host,
      port: proxyInfo.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        'Host': targetHost,
        'Connection': 'close'
      },
      timeout: 30000
    });

    proxyReq.on('response', (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`[HTTP] [${credentials.name}] Error:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Proxy Error',
          message: err.message,
          proxy: proxyInfo.proxy
        }));
      }
    });

    req.pipe(proxyReq);
  }

  handleHttpsConnect(req, clientSocket, head) {
    const credentials = parseProxyAuth(req);

    if (!credentials) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n');
      clientSocket.write('Proxy-Authenticate: Basic realm="Proxy Server"\r\n\r\n');
      clientSocket.end();
      return;
    }

    if (credentials.pass !== this.password) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      clientSocket.end();
      return;
    }

    const proxyInfo = this.getProxyByUsername(credentials.name);

    if (!proxyInfo) {
      clientSocket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      clientSocket.end();
      return;
    }

    console.log(`[HTTPS] [${credentials.name}] CONNECT ${req.url} via ${proxyInfo.proxy} (${proxyInfo.isp})`);

    const proxySocket = net.connect(proxyInfo.port, proxyInfo.host, () => {
      proxySocket.write(`CONNECT ${req.url} HTTP/1.1\r\n\r\n`);

      proxySocket.once('data', (data) => {
        const response = data.toString();

        if (response.includes('200')) {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          proxySocket.pipe(clientSocket);
          clientSocket.pipe(proxySocket);
        } else {
          console.error(`[HTTPS] [${credentials.name}] Upstream error: ${response.split('\r\n')[0]}`);
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.end();
          proxySocket.end();
        }
      });
    });

    proxySocket.on('error', (err) => {
      console.error(`[HTTPS] [${credentials.name}] Error:`, err.message);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    });

    clientSocket.on('error', () => {
      proxySocket.end();
    });

    proxySocket.setTimeout(30000);
    proxySocket.on('timeout', () => {
      clientSocket.end();
      proxySocket.end();
    });
  }

  stop() {
    if (!this.server) {
      return;
    }

    console.log('[ProxyServer] Stopping server...');
    this.server.close(() => {
      console.log('[ProxyServer] ✓ Server stopped');
    });
    this.server = null;
  }

  getStats() {
    return {
      totalProxies: this.proxyList.length,
      port: this.port,
      usernamePrefix: this.usernamePrefix,
      usernameRange: `${this.usernamePrefix}1 - ${this.usernamePrefix}${this.proxyList.length}`,
      proxies: this.proxyList.map((p, i) => ({
        username: `${this.usernamePrefix}${i + 1}`,
        proxy: p.proxy,
        isp: p.isp,
        secsLeft: p.secsLeft,
        expiry: p.expiry
      }))
    };
  }
}

module.exports = ProxyServerByUsername;
