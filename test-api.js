const axios = require('axios');

const API_URL = 'http://217.15.163.20:8549/api/cron/getliveproxiesdata?authensone=mysonetrend&time=60';

console.log('Testing API connection...');
console.log('URL:', API_URL);
console.log('');

axios.get(API_URL, {
  timeout: 30000,
  headers: {
    'User-Agent': 'AMAC-Proxy-Server/1.0'
  }
})
.then(response => {
  console.log('✓ API Connection Successful!');
  console.log('');
  console.log('Response Status:', response.status);
  console.log('Response Data:');
  console.log('  - Status:', response.data.status);
  console.log('  - Total Proxies:', response.data.length);
  console.log('  - Proxies Count:', response.data.proxies ? response.data.proxies.length : 0);
  console.log('');

  if (response.data.proxies && response.data.proxies.length > 0) {
    console.log('Sample Proxies (first 3):');
    response.data.proxies.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.proxy} (${p.isp}) - ${p.secs_left}s left`);
    });
  }

  console.log('');
  console.log('✓ API is working correctly!');
  process.exit(0);
})
.catch(error => {
  console.log('✗ API Connection Failed!');
  console.log('');
  console.log('Error:', error.message);

  if (error.code === 'ECONNREFUSED') {
    console.log('');
    console.log('Possible causes:');
    console.log('  - API server is down');
    console.log('  - Port 8549 is blocked');
    console.log('  - Wrong IP address');
  } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    console.log('');
    console.log('Possible causes:');
    console.log('  - Network is slow');
    console.log('  - API is taking too long to respond');
    console.log('  - Firewall blocking the request');
  }

  process.exit(1);
});
