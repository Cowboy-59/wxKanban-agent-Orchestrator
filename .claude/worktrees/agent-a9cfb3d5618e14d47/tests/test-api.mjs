// Simple test to verify the API returns tempPassword
const testApi = async () => {
  try {
    // First login to get a cookie
    const loginRes = await fetch('http://localhost:3001/api/auth/signin', {

      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'devteam@alitho.com', password: 'test123' }),
      credentials: 'include'
    });
    
    console.log('Login status:', loginRes.status);
    
    if (loginRes.status !== 200) {
      console.log('Login failed, trying to create user anyway...');
    }
    
    // Try to create a user
    const createRes = await fetch('http://localhost:3001/api/admin/users', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': loginRes.headers.get('set-cookie') || ''
      },
      body: JSON.stringify({
        email: `test${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        usertype: 'TEAM_MEMBER',
        requirePasswordChange: true
      }),
      credentials: 'include'
    });
    
    const result = await createRes.json();
    console.log('Create user status:', createRes.status);
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('Has tempPassword?', 'tempPassword' in result);
    console.log('tempPassword value:', result.tempPassword);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
};

testApi();
