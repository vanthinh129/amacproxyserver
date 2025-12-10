const http = require('http');
const net = require('net');
const url = require('url');
const auth = require('basic-auth');

class MultiProxyServer {
  constructor(config) {
    this.config = config;
    this.servers = [];
    this.proxyList = [];
    this.startPort = config.startPort || 11001;
    this.enableAuth = config.enableAuth || false;
    this.username = config.username;
    this.password = config.password;
  }

  updateProxies(proxies) {
    console.log(`[MultiProxyServer] Updating with ${proxies.length} proxies`);

    this.stopAll();

    this.proxyList = proxies;

    this.startAll();
  }

  startAll() {
    console.log(`[MultiProxyServer] Starting ${this.proxyList.length} proxy servers from port ${this.startPort}...`);

    this.proxyList.forEach((proxyInfo, index) => {
      const port = this.startPort + index;
      this.startProxyServer(port, proxyInfo, index + 1);
    });

    console.log(`[MultiProxyServer] ✓ Started ${this.servers.length} proxy servers (ports ${this.startPort}-${this.startPort + this.proxyList.length - 1})`);
  }

  startProxyServer(port, proxyInfo, proxyIndex) {
    const server = http.createServer((req, res) => {
      if (this.enableAuth) {
        const credentials = auth(req);
        if (!credentials || credentials.name !== this.username || credentials.pass !== this.password) {
          res.statusCode = 401;
          res.setHeader('WWW-Authenticate', 'Basic realm="Proxy Server"');
          res.end('Access denied');
          return;
        }
      }

      const parsedUrl = url.parse(req.url);
      const targetHost = parsedUrl.hostname;

      if (!targetHost) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request URL' }));
        return;
      }

      console.log(`[Proxy #${proxyIndex}:${port}] ${req.method} ${req.url} via ${proxyInfo.proxy}`);

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
        console.error(`[Proxy #${proxyIndex}:${port}] Error:`, err.message);
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
    });

    server.on('connect', (req, clientSocket, head) => {
      if (this.enableAuth) {
        const credentials = auth(req);
        if (!credentials || credentials.name !== this.username || credentials.pass !== this.password) {
          clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
          clientSocket.end();
          return;
        }
      }

      console.log(`[Proxy #${proxyIndex}:${port}] CONNECT ${req.url} via ${proxyInfo.proxy}`);

      const proxySocket = net.connect(proxyInfo.port, proxyInfo.host, () => {
        proxySocket.write(`CONNECT ${req.url} HTTP/1.1\r\n\r\n`);

        proxySocket.once('data', (data) => {
          const response = data.toString();

          if (response.includes('200')) {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            proxySocket.pipe(clientSocket);
            clientSocket.pipe(proxySocket);
          } else {
            console.error(`[Proxy #${proxyIndex}:${port}] Upstream error: ${response.split('\r\n')[0]}`);
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.end();
            proxySocket.end();
          }
        });
      });

      proxySocket.on('error', (err) => {
        console.error(`[Proxy #${proxyIndex}:${port}] Error:`, err.message);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      });

      clientSocket.on('error', (err) => {
        proxySocket.end();
      });

      proxySocket.setTimeout(30000);
      proxySocket.on('timeout', () => {
        clientSocket.end();
        proxySocket.end();
      });
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(`  [✓] Proxy #${proxyIndex} listening on port ${port} → ${proxyInfo.proxy} (${proxyInfo.isp}) [${proxyInfo.secsLeft}s left]`);
    });

    server.on('error', (err) => {
      console.error(`[Proxy #${proxyIndex}:${port}] Server error:`, err.message);
    });

    this.servers.push({
      server,
      port,
      proxyInfo,
      index: proxyIndex
    });
  }

  stopAll() {
    if (this.servers.length === 0) {
      return;
    }

    console.log(`[MultiProxyServer] Stopping ${this.servers.length} proxy servers...`);

    this.servers.forEach(({ server, port }) => {
      server.close();
    });

    this.servers = [];
    console.log(`[MultiProxyServer] ✓ All servers stopped`);
  }

  getStats() {
    return {
      totalServers: this.servers.length,
      startPort: this.startPort,
      endPort: this.startPort + this.servers.length - 1,
      servers: this.servers.map(s => ({
        port: s.port,
        index: s.index,
        proxy: s.proxyInfo.proxy,
        isp: s.proxyInfo.isp,
        secsLeft: s.proxyInfo.secsLeft
      }))
    };
  }
}

module.exports = MultiProxyServer;
