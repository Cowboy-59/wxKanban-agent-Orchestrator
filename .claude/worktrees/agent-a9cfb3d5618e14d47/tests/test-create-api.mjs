import http from 'http';

// First, we need to get a cookie by logging in
const loginOptions = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/signin',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

const loginData = JSON.stringify({
  email: 'devteam@alitho.com',
  password: 'test123'
});

const loginReq = http.request(loginOptions, (res) => {
  let data = '';
  let cookies = res.headers['set-cookie'];
  
  console.log('Login Status:', res.statusCode);
  console.log('Cookies:', cookies);
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Login Response:', data);
    
    if (res.statusCode === 200 && cookies) {
      // Now create a user
      const timestamp = Date.now();
      const createOptions = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/admin/users',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies.join('; '),
        },
      };
      
      const createData = JSON.stringify({
        email: `testuser${timestamp}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        usertype: 'TEAM_MEMBER',
        requirePasswordChange: true
      });
      
      const createReq = http.request(createOptions, (createRes) => {
        let createResponseData = '';
        
        console.log('\nCreate User Status:', createRes.statusCode);
        
        createRes.on('data', (chunk) => {
          createResponseData += chunk;
        });
        
        createRes.on('end', () => {
          console.log('Create User Response:', createResponseData);
          
          try {
            const parsed = JSON.parse(createResponseData);
            console.log('\nParsed Response:');
            console.log('- success:', parsed.success);
            console.log('- message:', parsed.message);
            console.log('- tempPassword:', parsed.tempPassword);
            console.log('- user:', JSON.stringify(parsed.user, null, 2));
          } catch (e) {
            console.log('Failed to parse response:', e.message);
          }
        });
      });
      
      createReq.on('error', (e) => {
        console.error('Create request error:', e.message);
      });
      
      createReq.write(createData);
      createReq.end();
    } else {
      console.log('Login failed, cannot test create user');
    }
  });
});

loginReq.on('error', (e) => {
  console.error('Login request error:', e.message);
});

loginReq.write(loginData);
loginReq.end();
