require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');
const auth = require('basic-auth');
const ProxyManager = require('./ProxyManager');

const PORT = process.env.PORT || 8080;
const PROXY_API_URL = process.env.PROXY_API_URL || 'http://217.15.163.20:8549/api/cron/getliveproxiesdata?authensone=mysonetrend&time=60';
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 30000;
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'password';
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';

const app = express();
const proxyManager = new ProxyManager(PROXY_API_URL, UPDATE_INTERVAL);

const authenticate = (req, res, next) => {
  if (!ENABLE_AUTH) {
    return next();
  }

  const credentials = auth(req);

  if (!credentials || credentials.name !== AUTH_USERNAME || credentials.pass !== AUTH_PASSWORD) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="Proxy Server"');
    res.end('Access denied');
  } else {
    next();
  }
};

app.get('/status', authenticate, (req, res) => {
  const stats = proxyManager.getStats();
  res.json({
    success: true,
    stats: stats,
    proxies: proxyManager.getProxies()
  });
});

app.get('/health', (req, res) => {
  const stats = proxyManager.getStats();
  res.json({
    success: true,
    healthy: stats.valid > 0,
    validProxies: stats.valid
  });
});

const server = http.createServer((req, res) => {
  if (req.url === '/status' || req.url === '/health') {
    return app(req, res);
  }

  if (ENABLE_AUTH) {
    const credentials = auth(req);
    if (!credentials || credentials.name !== AUTH_USERNAME || credentials.pass !== AUTH_PASSWORD) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm="Proxy Server"');
      res.end('Access denied');
      return;
    }
  }

  const targetProxy = proxyManager.getRoundRobinProxy();

  if (!targetProxy) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'No available proxies',
      message: 'All proxies are currently unavailable or expired'
    }));
    return;
  }

  console.log(`[HTTP Proxy] ${req.method} ${req.url} via ${targetProxy.proxy}`);

  const parsedUrl = url.parse(req.url);
  const targetHost = parsedUrl.hostname;
  const targetPort = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80);
  const targetPath = parsedUrl.path;

  const proxyReq = http.request({
    host: targetProxy.host,
    port: targetProxy.port,
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
    console.error(`[HTTP Proxy] Error with ${targetProxy.proxy}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Proxy Error',
        message: err.message,
        proxy: targetProxy.proxy
      }));
    }
  });

  req.pipe(proxyReq);
});

server.on('connect', (req, clientSocket, head) => {
  if (ENABLE_AUTH) {
    const credentials = auth(req);
    if (!credentials || credentials.name !== AUTH_USERNAME || credentials.pass !== AUTH_PASSWORD) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      clientSocket.end();
      return;
    }
  }

  const targetProxy = proxyManager.getRoundRobinProxy();

  if (!targetProxy) {
    clientSocket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    clientSocket.end();
    return;
  }

  console.log(`[HTTPS Proxy] CONNECT ${req.url} via ${targetProxy.proxy}`);

  const proxySocket = net.connect(targetProxy.port, targetProxy.host, () => {
    proxySocket.write(`CONNECT ${req.url} HTTP/1.1\r\n\r\n`);

    proxySocket.once('data', (data) => {
      const response = data.toString();

      if (response.includes('200')) {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        proxySocket.pipe(clientSocket);
        clientSocket.pipe(proxySocket);
      } else {
        console.error(`[HTTPS Proxy] Upstream proxy error: ${response.split('\r\n')[0]}`);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
        proxySocket.end();
      }
    });
  });

  proxySocket.on('error', (err) => {
    console.error(`[HTTPS Proxy] Error with ${targetProxy.proxy}:`, err.message);
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.end();
  });

  clientSocket.on('error', (err) => {
    console.error('[HTTPS Proxy] Client socket error:', err.message);
    proxySocket.end();
  });

  proxySocket.on('timeout', () => {
    console.error(`[HTTPS Proxy] Timeout with ${targetProxy.proxy}`);
    clientSocket.end();
    proxySocket.end();
  });

  proxySocket.setTimeout(30000);
});

(async () => {
  try {
    await proxyManager.start();

    server.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(50));
      console.log('🚀 AMAC Proxy Server Started');
      console.log('='.repeat(50));
      console.log(`📡 Server listening on: 0.0.0.0:${PORT}`);
      console.log(`🔄 Proxy update interval: ${UPDATE_INTERVAL}ms`);
      console.log(`🔐 Authentication: ${ENABLE_AUTH ? 'ENABLED' : 'DISABLED'}`);
      console.log(`📊 Status endpoint: http://localhost:${PORT}/status`);
      console.log(`❤️  Health endpoint: http://localhost:${PORT}/health`);
      console.log('='.repeat(50));
    });

    const gracefulShutdown = () => {
      console.log('\n🛑 Shutting down gracefully...');
      proxyManager.stop();
      server.close(() => {
        console.log('👋 Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();
