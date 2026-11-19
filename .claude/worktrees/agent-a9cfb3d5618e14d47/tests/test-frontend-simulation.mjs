/**
 * Test script that simulates the frontend API calls for phase assignment
 * This tests the exact pattern the UI uses
 */

const API_BASE = 'http://localhost:3001/api';
const credentials = {
  email: 'devteam@alitho.com',
  password: '$ccsCowboy007'
};

async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response;
}

async function login() {
  console.log('Logging in...');
  const response = await apiFetch('/auth/signin', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('Login successful');
  return data.token;
}

async function getProjects(token) {
  const response = await apiFetch('/projects', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}

async function getPhases(token, projectId) {
  const response = await apiFetch(`/projects/${projectId}/phases`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}

async function getTeamMembers(token) {
  const response = await apiFetch('/team', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}

async function assignUserToPhase(token, projectId, phaseId, userId) {
  console.log(`\n=== Assigning user ${userId || '(null)'} to phase ${phaseId} ===`);
  
  const body = { assigneduserid: userId };
  console.log('Request body:', JSON.stringify(body));
  
  const response = await apiFetch(`/projects/${projectId}/phases/${phaseId}/assign`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  
  console.log(`Response status: ${response.status}`);
  const responseData = await response.json();
  console.log('Response body:', JSON.stringify(responseData));
  
  if (!response.ok) {
    throw new Error(`Assignment failed: ${response.status} - ${JSON.stringify(responseData)}`);
  }
  
  return responseData;
}

async function runTests() {
  try {
    const token = await login();
    
    // Get projects
    const projectsData = await getProjects(token);
    const project = projectsData.projects[0];
    console.log(`\nUsing project: ${project.name} (${project.id})`);
    
    // Get phases
    const phasesData = await getPhases(token, project.id);
    const phase = phasesData.phases[0];
    console.log(`Using phase: ${phase.phasename} (${phase.id})`);
    
    // Get team members
    const teamData = await getTeamMembers(token);
    const member = teamData.members[0];
    console.log(`Found team member: ${member.fullname} (${member.userid})`);
    
    // Test 1: Assign user (UUID string)
    await assignUserToPhase(token, project.id, phase.id, member.userid);
    console.log('✓ Test 1 passed: Assign user with UUID\n');
    
    // Test 2: Unassign user (null)
    await assignUserToPhase(token, project.id, phase.id, null);
    console.log('✓ Test 2 passed: Unassign user with null\n');
    
    // Test 3: Unassign user (empty string - what UI might send)
    await assignUserToPhase(token, project.id, phase.id, "");
    console.log('✓ Test 3 passed: Unassign user with empty string\n');
    
    // Test 4: Assign user again
    await assignUserToPhase(token, project.id, phase.id, member.userid);
    console.log('✓ Test 4 passed: Re-assign user\n');
    
    console.log('=== ALL TESTS PASSED ===');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

runTests();
