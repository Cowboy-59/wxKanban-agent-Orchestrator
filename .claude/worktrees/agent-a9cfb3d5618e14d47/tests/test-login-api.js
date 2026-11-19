requirepasswordchangeconst http = require('http');

const postData = JSON.stringify({
  email: 'devteam@alitho.com',
  password: 'test123'
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/signin',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log('Response:', JSON.stringify(parsed, null, 2));
      if (parsed.error) {
        console.log('❌ Login failed:', parsed.error);
      } else {
        console.log('✅ Login successful!');
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request error:', e.message);
});

req.write(postData);
req.end();
