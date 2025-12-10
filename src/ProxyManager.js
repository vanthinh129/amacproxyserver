const axios = require('axios');

class ProxyManager {
  constructor(apiUrl, updateInterval = 30000) {
    this.apiUrl = apiUrl;
    this.updateInterval = updateInterval;
    this.proxies = [];
    this.currentIndex = 0;
    this.isRunning = false;
    this.updateTimer = null;
  }

  async start() {
    console.log('[ProxyManager] Starting...');
    this.isRunning = true;

    await this.updateProxies();

    this.updateTimer = setInterval(async () => {
      await this.updateProxies();
    }, this.updateInterval);

    console.log(`[ProxyManager] Started. Update interval: ${this.updateInterval}ms`);
  }

  stop() {
    console.log('[ProxyManager] Stopping...');
    this.isRunning = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    console.log('[ProxyManager] Stopped.');
  }

  async updateProxies(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[ProxyManager] Fetching proxies from API... (Attempt ${attempt}/${retries})`);
        const response = await axios.get(this.apiUrl, {
          timeout: 30000,
          headers: {
            'User-Agent': 'AMAC-Proxy-Server/1.0'
          }
        });

        if (response.data && response.data.status && response.data.proxies) {
          const now = Math.floor(Date.now() / 1000);

          const validProxies = response.data.proxies.filter(p => {
            return p.expiry > now && p.secs_left > 0;
          });

          this.proxies = validProxies.map(p => ({
            proxy: p.proxy,
            host: p.proxy.split(':')[0],
            port: parseInt(p.proxy.split(':')[1]),
            expiry: p.expiry,
            secsLeft: p.secs_left,
            isp: p.isp
          }));

          console.log(`[ProxyManager] ✓ Updated: ${this.proxies.length} valid proxies (${response.data.length} total)`);
          return;
        } else {
          console.error('[ProxyManager] Invalid response format:', response.data);
        }
      } catch (error) {
        console.error(`[ProxyManager] ✗ Attempt ${attempt} failed:`, error.message);

        if (attempt < retries) {
          const waitTime = attempt * 2000;
          console.log(`[ProxyManager] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          console.error('[ProxyManager] All retry attempts failed. Keeping existing proxies.');
        }
      }
    }
  }

  getRandomProxy() {
    if (this.proxies.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const validProxies = this.proxies.filter(p => p.expiry > now);

    if (validProxies.length === 0) {
      console.warn('[ProxyManager] No valid proxies available');
      return null;
    }

    const randomIndex = Math.floor(Math.random() * validProxies.length);
    return validProxies[randomIndex];
  }

  getRoundRobinProxy() {
    if (this.proxies.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const validProxies = this.proxies.filter(p => p.expiry > now);

    if (validProxies.length === 0) {
      console.warn('[ProxyManager] No valid proxies available');
      return null;
    }

    const proxy = validProxies[this.currentIndex % validProxies.length];
    this.currentIndex++;

    return proxy;
  }

  getStats() {
    const now = Math.floor(Date.now() / 1000);
    const validProxies = this.proxies.filter(p => p.expiry > now);

    const ispCounts = validProxies.reduce((acc, p) => {
      acc[p.isp] = (acc[p.isp] || 0) + 1;
      return acc;
    }, {});

    return {
      total: this.proxies.length,
      valid: validProxies.length,
      expired: this.proxies.length - validProxies.length,
      byISP: ispCounts,
      isRunning: this.isRunning
    };
  }

  getProxies() {
    const now = Math.floor(Date.now() / 1000);
    return this.proxies.filter(p => p.expiry > now);
  }
}

module.exports = ProxyManager;
