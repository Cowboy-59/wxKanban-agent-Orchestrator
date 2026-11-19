// Test script for PATCH /api/auth/profile endpoint on port 3001
import http from 'http';

const BASE_URL = 'localhost';
const PORT = 3001;

// Test credentials
const TEST_EMAIL = 'devteam@alitho.com';
const TEST_PASSWORD = 'TempPass123!';

async function login() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD });
    
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: '/api/auth/signin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('Login response status:', res.statusCode);
          
          // Extract cookies from response headers
          const cookies = res.headers['set-cookie'];
          console.log('Cookies received:', cookies ? 'Yes' : 'No');
          
          resolve({ status: res.statusCode, data: result, cookies });
        } catch (e) {
          reject(new Error('Failed to parse login response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function updateProfile(cookies, profileData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(profileData);
    
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: '/api/auth/profile',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': cookies ? cookies.join('; ') : ''
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('Profile update response status:', res.statusCode);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          reject(new Error('Failed to parse profile update response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function getCurrentUser(cookies) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        'Cookie': cookies ? cookies.join('; ') : ''
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('Get user response status:', res.statusCode);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          reject(new Error('Failed to parse user response: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('=== Testing Profile API on Port 3001 ===\n');
  
  try {
    // Step 1: Login
    console.log('1. Testing login...');
    const loginResult = await login();
    
    if (loginResult.status !== 200) {
      console.error('❌ Login failed:', loginResult.data);
      return;
    }
    
    const cookies = loginResult.cookies;
    console.log('✅ Login successful\n');
    
    // Step 2: Get current user (before update)
    console.log('2. Getting current user (before update)...');
    const beforeUpdate = await getCurrentUser(cookies);
    if (beforeUpdate.status === 200) {
      console.log('   Current fullname:', beforeUpdate.data.fullname);
      console.log('   Current timezone:', beforeUpdate.data.timezone);
      console.log('   Current tracktime:', beforeUpdate.data.tracktime);
    }
    console.log('');
    
    // Step 3: Update profile
    console.log('3. Testing profile update...');
    const updateData = {
      fullname: 'Test User Updated ' + Date.now(),
      timezone: 'America/New_York',
      tracktime: true
    };
    const updateResult = await updateProfile(cookies, updateData);
    
    if (updateResult.status === 200) {
      console.log('✅ Profile update successful');
      console.log('   Response:', JSON.stringify(updateResult.data, null, 2));
    } else {
      console.error('❌ Profile update failed:', updateResult.data);
    }
    console.log('');
    
    // Step 4: Get current user (after update) to verify
    console.log('4. Getting current user (after update)...');
    const afterUpdate = await getCurrentUser(cookies);
    
    if (afterUpdate.status === 200) {
      console.log('   Updated fullname:', afterUpdate.data.fullname);
      console.log('   Updated timezone:', afterUpdate.data.timezone);
      console.log('   Updated tracktime:', afterUpdate.data.tracktime);
      
      // Verify changes
      if (afterUpdate.data.fullname === updateData.fullname && 
          afterUpdate.data.timezone === updateData.timezone &&
          afterUpdate.data.tracktime === updateData.tracktime) {
        console.log('✅ Profile changes verified in database\n');
      } else {
        console.log('⚠️ Profile changes may not have persisted');
        console.log('Expected:', updateData);
        console.log('Got:', { 
          fullname: afterUpdate.data.fullname, 
          timezone: afterUpdate.data.timezone, 
          tracktime: afterUpdate.data.tracktime 
        });
      }
    }
    console.log('');
    
    // Step 5: Test without authentication
    console.log('5. Testing without authentication...');
    const noAuthResult = await updateProfile(null, {
      fullname: 'Should Fail',
      timezone: 'UTC'
    });
    
    if (noAuthResult.status === 401) {
      console.log('✅ Authentication check working (401 for no auth)\n');
    } else {
      console.log('⚠️ Authentication check may have issues (status:', noAuthResult.status + ')');
      console.log('   Response:', noAuthResult.data);
    }
    
    console.log('=== All API Tests Complete ===');
    
  } catch (error) {
    console.error('Test failed with error:', error.message);
  }
}

runTests();
