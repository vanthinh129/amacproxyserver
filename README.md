# AMAC Proxy Server

Dynamic Proxy Server - Forward HTTP/HTTPS requests through rotating proxies fetched from a remote API.

## Features

- **Auto-updating Proxy Pool**: Automatically fetches and updates proxy list from remote API
- **HTTP & HTTPS Support**: Handles both HTTP and HTTPS (CONNECT) requests
- **Round-robin Load Balancing**: Distributes requests evenly across available proxies
- **Automatic Expiry Management**: Filters out expired proxies automatically
- **Basic Authentication**: Optional authentication to protect your proxy server
- **Status & Health Endpoints**: Monitor proxy pool status and server health
- **Graceful Shutdown**: Proper cleanup on server termination

## Architecture

```
Client Request
     ↓
AMAC Proxy Server (This Server)
     ↓
Proxy Pool Manager
     ↓
Live Proxy (from API)
     ↓
Target Website
```

## Installation

### Prerequisites

- Node.js 14+ installed
- Running on Ubuntu 22.04 VPS with IP: 217.15.163.20 (required for proxies to work)

### Steps

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
nano .env
```

Edit `.env` with your settings:
```env
PORT=8080
PROXY_API_URL=http://217.15.163.20:8549/api/cron/getliveproxiesdata?authensone=mysonetrend&time=60
UPDATE_INTERVAL=30000
ENABLE_AUTH=true
AUTH_USERNAME=admin
AUTH_PASSWORD=your-secure-password
```

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Usage

### Using as HTTP Proxy

Configure your application or browser to use the proxy:

```
Proxy Host: 217.15.163.20
Proxy Port: 8080
Authentication: admin:your-secure-password (if enabled)
```

### Using with curl

```bash
# HTTP request
curl -x http://admin:password@217.15.163.20:8080 http://example.com

# HTTPS request
curl -x http://admin:password@217.15.163.20:8080 https://example.com
```

### Using with Node.js

```javascript
const axios = require('axios');

const response = await axios.get('https://api.example.com', {
  proxy: {
    host: '217.15.163.20',
    port: 8080,
    auth: {
      username: 'admin',
      password: 'password'
    }
  }
});
```

### Using with Python

```python
import requests

proxies = {
    'http': 'http://admin:password@217.15.163.20:8080',
    'https': 'http://admin:password@217.15.163.20:8080',
}

response = requests.get('https://example.com', proxies=proxies)
```

## API Endpoints

### GET /status

Get proxy pool status and list of available proxies.

**Authentication Required**: Yes (if enabled)

**Response**:
```json
{
  "success": true,
  "stats": {
    "total": 40,
    "valid": 35,
    "expired": 5,
    "byISP": {
      "vnpt": 12,
      "viettel": 15,
      "fpt": 8
    },
    "isRunning": true
  },
  "proxies": [
    {
      "proxy": "14.241.72.156:10447",
      "host": "14.241.72.156",
      "port": 10447,
      "expiry": 1765363420,
      "secsLeft": 87,
      "isp": "vnpt"
    }
  ]
}
```

### GET /health

Health check endpoint for monitoring.

**Authentication Required**: No

**Response**:
```json
{
  "success": true,
  "healthy": true,
  "validProxies": 35
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server listening port | `8080` |
| `PROXY_API_URL` | API endpoint to fetch proxies | Required |
| `UPDATE_INTERVAL` | Proxy update interval (ms) | `30000` |
| `ENABLE_AUTH` | Enable basic authentication | `false` |
| `AUTH_USERNAME` | Username for authentication | `admin` |
| `AUTH_PASSWORD` | Password for authentication | `password` |

## How It Works

1. **Proxy Manager** fetches proxy list from the configured API endpoint every 30 seconds (configurable)
2. **Automatic Filtering**: Only keeps proxies that haven't expired
3. **Request Forwarding**:
   - Client sends request to AMAC Proxy Server
   - Server selects a live proxy using round-robin algorithm
   - Request is forwarded through the selected proxy
   - Response is returned to client
4. **Error Handling**: If a proxy fails, returns 502 error with details

## Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the server
pm2 start src/index.js --name amac-proxy-server

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Using systemd

Create `/etc/systemd/system/amac-proxy.service`:

```ini
[Unit]
Description=AMAC Proxy Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/amacproxyserver
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable amac-proxy
sudo systemctl start amac-proxy
sudo systemctl status amac-proxy
```

## Troubleshooting

### No available proxies

Check if:
- API endpoint is accessible
- Proxies haven't all expired
- Check logs for fetch errors

```bash
# Check logs
pm2 logs amac-proxy-server
```

### Connection refused

- Verify server is running
- Check firewall settings
- Ensure correct IP and port

```bash
# Check if server is listening
netstat -tulpn | grep 8080
```

### Authentication errors

- Verify ENABLE_AUTH setting
- Check username/password in .env
- Ensure client is sending correct credentials

## Security Considerations

1. **Change default credentials**: Always change AUTH_PASSWORD in production
2. **Use HTTPS**: Consider putting server behind nginx with SSL
3. **Firewall**: Restrict access to trusted IPs if possible
4. **Monitor usage**: Regularly check /status endpoint for unusual activity

## License

MIT

## Support

For issues and questions, please create an issue in the repository.