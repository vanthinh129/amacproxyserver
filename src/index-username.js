require('dotenv').config();
const express = require('express');
const http = require('http');
const ProxyManager = require('./ProxyManager');
const ProxyServerByUsername = require('./ProxyServerByUsername');

const CONTROL_PORT = parseInt(process.env.CONTROL_PORT) || 11001;
const PROXY_PORT = parseInt(process.env.PROXY_PORT) || 11000;
const PROXY_API_URL = process.env.PROXY_API_URL || 'http://217.15.163.20:8549/api/cron/getliveproxiesdata?authensone=mysonetrend&time=60';
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 30000;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || 'mypass';
const USERNAME_PREFIX = process.env.USERNAME_PREFIX || 'proxy';

const app = express();
const proxyManager = new ProxyManager(PROXY_API_URL, UPDATE_INTERVAL);
const proxyServer = new ProxyServerByUsername({
  port: PROXY_PORT,
  password: PROXY_PASSWORD,
  usernamePrefix: USERNAME_PREFIX
});

app.use(express.json());

app.get('/', (req, res) => {
  const stats = proxyServer.getStats();
  res.send(`
    <html>
    <head>
      <title>AMAC Proxy Server - Username Auth</title>
      <style>
        body { font-family: monospace; max-width: 1200px; margin: 50px auto; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
        h1 { color: #4ec9b0; }
        h2 { color: #569cd6; margin-top: 30px; }
        .stats { background: #252526; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .code { background: #1e1e1e; border: 1px solid #3e3e42; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .proxy-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; margin-top: 20px; }
        .proxy-item { background: #252526; padding: 10px; border-radius: 3px; border-left: 3px solid #4ec9b0; }
        .expired { border-left-color: #f48771; opacity: 0.6; }
        a { color: #4ec9b0; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>🚀 AMAC Proxy Server</h1>
      <div class="stats">
        <strong>Total Proxies:</strong> ${stats.totalProxies}<br>
        <strong>Proxy Port:</strong> ${stats.port}<br>
        <strong>Username Range:</strong> ${stats.usernameRange}<br>
        <strong>Password:</strong> ${PROXY_PASSWORD}
      </div>

      <h2>📖 Usage</h2>
      <div class="code">
# Using proxy #1<br>
curl -x http://${USERNAME_PREFIX}1:${PROXY_PASSWORD}@YOUR_SERVER_IP:${PROXY_PORT} http://ipinfo.io<br>
<br>
# Using proxy #2<br>
curl -x http://${USERNAME_PREFIX}2:${PROXY_PASSWORD}@YOUR_SERVER_IP:${PROXY_PORT} http://ipinfo.io<br>
<br>
# With Node.js/Axios<br>
axios.get('http://example.com', {<br>
  proxy: {<br>
    host: 'YOUR_SERVER_IP',<br>
    port: ${PROXY_PORT},<br>
    auth: { username: '${USERNAME_PREFIX}1', password: '${PROXY_PASSWORD}' }<br>
  }<br>
})
      </div>

      <h2>🔗 API Endpoints</h2>
      <ul>
        <li><a href="/status">GET /status</a> - Server status and proxy list</li>
        <li><a href="/health">GET /health</a> - Health check</li>
        <li><a href="/list">GET /list</a> - List all proxies with usernames</li>
      </ul>

      <h2>📡 Available Proxies (${stats.totalProxies})</h2>
      <div class="proxy-list">
        ${stats.proxies.slice(0, 100).map(p => {
          const now = Math.floor(Date.now() / 1000);
          const expired = p.expiry < now;
          return `
            <div class="proxy-item ${expired ? 'expired' : ''}">
              <strong>${p.username}</strong><br>
              ${p.proxy} (${p.isp})<br>
              ${expired ? '❌ Expired' : `⏱️ ${p.secsLeft}s left`}
            </div>
          `;
        }).join('')}
        ${stats.totalProxies > 100 ? `<div class="proxy-item">... and ${stats.totalProxies - 100} more</div>` : ''}
      </div>
    </body>
    </html>
  `);
});

app.get('/status', (req, res) => {
  const proxyStats = proxyManager.getStats();
  const serverStats = proxyServer.getStats();

  res.json({
    success: true,
    proxyManager: proxyStats,
    server: {
      port: serverStats.port,
      totalProxies: serverStats.totalProxies,
      usernameRange: serverStats.usernameRange
    }
  });
});

app.get('/health', (req, res) => {
  const stats = proxyServer.getStats();
  res.json({
    success: true,
    healthy: stats.totalProxies > 0,
    totalProxies: stats.totalProxies
  });
});

app.get('/list', (req, res) => {
  const stats = proxyServer.getStats();
  res.json({
    success: true,
    proxies: stats.proxies
  });
});

const updateProxyServer = () => {
  const proxies = proxyManager.getProxies();

  if (proxies.length > 0) {
    console.log(`[Main] Updating proxy server with ${proxies.length} proxies...`);
    proxyServer.updateProxies(proxies);
  } else {
    console.warn('[Main] No valid proxies available');
  }
};

(async () => {
  try {
    console.log('='.repeat(70));
    console.log('🚀 AMAC Proxy Server (Username Authentication) Starting...');
    console.log('='.repeat(70));

    await proxyManager.start();

    updateProxyServer();

    proxyServer.start();

    setInterval(() => {
      updateProxyServer();
    }, UPDATE_INTERVAL);

    const controlServer = http.createServer(app);
    controlServer.listen(CONTROL_PORT, '0.0.0.0', () => {
      const stats = proxyServer.getStats();

      console.log('');
      console.log('='.repeat(70));
      console.log('✓ AMAC Proxy Server Started Successfully!');
      console.log('='.repeat(70));
      console.log(`📊 Control Panel: http://0.0.0.0:${CONTROL_PORT}`);
      console.log(`   - Dashboard: http://localhost:${CONTROL_PORT}/`);
      console.log(`   - Status:    http://localhost:${CONTROL_PORT}/status`);
      console.log(`   - List:      http://localhost:${CONTROL_PORT}/list`);
      console.log('');
      console.log(`🌐 Proxy Server: 0.0.0.0:${PROXY_PORT}`);
      console.log(`   - Total Proxies: ${stats.totalProxies}`);
      console.log(`   - Username Range: ${stats.usernameRange}`);
      console.log(`   - Password: ${PROXY_PASSWORD}`);
      console.log('');
      console.log(`🔄 Auto Update: Every ${UPDATE_INTERVAL}ms`);
      console.log('');
      console.log('📖 Usage Examples:');
      console.log(`   curl -x http://${USERNAME_PREFIX}1:${PROXY_PASSWORD}@localhost:${PROXY_PORT} http://ipinfo.io`);
      console.log(`   curl -x http://${USERNAME_PREFIX}2:${PROXY_PASSWORD}@localhost:${PROXY_PORT} http://ipinfo.io`);
      console.log('='.repeat(70));
    });

    const gracefulShutdown = () => {
      console.log('\n🛑 Shutting down gracefully...');
      proxyServer.stop();
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
