require('dotenv').config();
const express = require('express');
const http = require('http');
const ProxyManager = require('./ProxyManager');
const MultiProxyServer = require('./MultiProxyServer');

const CONTROL_PORT = process.env.CONTROL_PORT || 8080;
const START_PROXY_PORT = parseInt(process.env.START_PROXY_PORT) || 11001;
const PROXY_API_URL = process.env.PROXY_API_URL || 'http://217.15.163.20:8549/api/cron/getliveproxiesdata?authensone=mysonetrend&time=60';
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 30000;
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'password';
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';

const app = express();
const proxyManager = new ProxyManager(PROXY_API_URL, UPDATE_INTERVAL);
const multiProxyServer = new MultiProxyServer({
  startPort: START_PROXY_PORT,
  enableAuth: ENABLE_AUTH,
  username: AUTH_USERNAME,
  password: AUTH_PASSWORD
});

app.use(express.json());

app.get('/status', (req, res) => {
  const proxyStats = proxyManager.getStats();
  const serverStats = multiProxyServer.getStats();

  res.json({
    success: true,
    proxyManager: proxyStats,
    servers: serverStats
  });
});

app.get('/health', (req, res) => {
  const stats = multiProxyServer.getStats();
  res.json({
    success: true,
    healthy: stats.totalServers > 0,
    totalServers: stats.totalServers
  });
});

app.get('/list', (req, res) => {
  const stats = multiProxyServer.getStats();
  res.json({
    success: true,
    servers: stats.servers
  });
});

const updateProxyServers = () => {
  const proxies = proxyManager.getProxies();

  if (proxies.length > 0) {
    console.log(`[Main] Updating proxy servers with ${proxies.length} proxies...`);
    multiProxyServer.updateProxies(proxies);
  } else {
    console.warn('[Main] No valid proxies available, keeping current servers');
  }
};

(async () => {
  try {
    console.log('='.repeat(70));
    console.log('🚀 AMAC Multi-Proxy Server Starting...');
    console.log('='.repeat(70));

    await proxyManager.start();

    updateProxyServers();

    setInterval(() => {
      updateProxyServers();
    }, UPDATE_INTERVAL);

    const controlServer = http.createServer(app);
    controlServer.listen(CONTROL_PORT, '0.0.0.0', () => {
      console.log('');
      console.log('='.repeat(70));
      console.log('✓ AMAC Multi-Proxy Server Started Successfully!');
      console.log('='.repeat(70));
      console.log(`📊 Control Panel: http://0.0.0.0:${CONTROL_PORT}`);
      console.log(`   - Status: http://localhost:${CONTROL_PORT}/status`);
      console.log(`   - Health: http://localhost:${CONTROL_PORT}/health`);
      console.log(`   - List:   http://localhost:${CONTROL_PORT}/list`);
      console.log('');
      console.log(`🔄 Proxy Update Interval: ${UPDATE_INTERVAL}ms`);
      console.log(`🔐 Authentication: ${ENABLE_AUTH ? 'ENABLED' : 'DISABLED'}`);
      console.log('');
      const stats = multiProxyServer.getStats();
      console.log(`📡 Active Proxy Servers: ${stats.totalServers}`);
      console.log(`   Ports: ${stats.startPort} - ${stats.endPort}`);
      console.log('');
      console.log('Usage:');
      console.log(`   curl -x http://localhost:${START_PROXY_PORT} http://ipinfo.io`);
      console.log(`   curl -x http://localhost:${START_PROXY_PORT + 1} http://ipinfo.io`);
      console.log(`   ...`);
      console.log('='.repeat(70));
    });

    const gracefulShutdown = () => {
      console.log('\n🛑 Shutting down gracefully...');
      multiProxyServer.stopAll();
      proxyManager.stop();
      controlServer.close(() => {
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
