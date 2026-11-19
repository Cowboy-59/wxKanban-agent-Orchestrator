// Test script to verify phase assignment with astapleton@alitho.com

const BASE_URL = 'http://localhost:3001';
const credentials = {
  email: 'devteam@alitho.com',
  password: '$ccsCowboy007'
};

async function login() {
  console.log('Logging in...');
  const response = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('Login successful, token received');
  return data.token;
}

async function getTeamMembers(token) {
  console.log('\nFetching team members...');
  const response = await fetch(`${BASE_URL}/api/team`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch team: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`Found ${data.members?.length || 0} team members`);
  
  // Find astapleton
  const astapleton = data.members?.find(m => 
    m.email?.toLowerCase() === 'astapleton@alitho.com' ||
    m.emailaddr?.toLowerCase() === 'astapleton@alitho.com'
  );
  
  if (astapleton) {
    console.log('Found astapleton:', {
      id: astapleton.id || astapleton.userid,
      email: astapleton.email || astapleton.emailaddr,
      name: astapleton.fullname || astapleton.name
    });
    return astapleton.id || astapleton.userid;
  } else {
    console.log('astapleton@alitho.com not found in team members');
    console.log('Available members:', data.members?.map(m => ({ 
      email: m.email || m.emailaddr, 
      id: m.id || m.userid 
    })));
    return null;
  }
}

async function getProjects(token) {
  console.log('\nFetching projects...');
  const response = await fetch(`${BASE_URL}/api/projects`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`Found ${data.projects?.length || 0} projects`);
  
  if (data.projects?.length > 0) {
    const project = data.projects[0];
    console.log('Using project:', project.name, `(${project.id})`);
    return project.id;
  }
  return null;
}

async function getPhases(token, projectId) {
  console.log(`\nFetching phases for project ${projectId}...`);
  const response = await fetch(`${BASE_URL}/api/projects/${projectId}/phases`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch phases: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`Found ${data.phases?.length || 0} phases`);
  
  if (data.phases?.length > 0) {
    // Find first phase that's not completed
    const phase = data.phases.find(p => p.status !== 'completed') || data.phases[0];
    console.log('Using phase:', phase.phasename, `(${phase.id})`);
    return phase.id;
  }
  return null;
}

async function assignUserToPhase(token, projectId, phaseId, userId) {
  console.log(`\n=== Assigning user ${userId} to phase ${phaseId} ===`);
  
  const response = await fetch(`${BASE_URL}/api/projects/${projectId}/phases/${phaseId}/assign`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ assigneduserid: userId })
  });
  
  console.log('Response status:', response.status);
  
  const responseText = await response.text();
  console.log('Response body:', responseText);
  
  if (response.ok) {
    console.log('✓ Assignment successful!');
    return true;
  } else {
    console.log('✗ Assignment failed');
    return false;
  }
}

async function unassignUserFromPhase(token, projectId, phaseId) {
  console.log(`\n=== Unassigning user from phase ${phaseId} ===`);
  
  const response = await fetch(`${BASE_URL}/api/projects/${projectId}/phases/${phaseId}/assign`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ assigneduserid: null })
  });
  
  console.log('Response status:', response.status);
  
  const responseText = await response.text();
  console.log('Response body:', responseText);
  
  if (response.ok) {
    console.log('✓ Unassignment successful!');
    return true;
  } else {
    console.log('✗ Unassignment failed');
    return false;
  }
}

async function main() {
  try {
    const token = await login();
    const projectId = await getProjects(token);
    
    if (!projectId) {
      console.log('No projects found');
      return;
    }
    
    const phaseId = await getPhases(token, projectId);
    
    if (!phaseId) {
      console.log('No phases found');
      return;
    }
    
    const userId = await getTeamMembers(token);
    
    if (!userId) {
      console.log('\nCannot test assignment - user not found');
      return;
    }
    
    // Test 1: Assign astapleton to phase
    const assignSuccess = await assignUserToPhase(token, projectId, phaseId, userId);
    
    // Test 2: Unassign
    if (assignSuccess) {
      await unassignUserFromPhase(token, projectId, phaseId);
    }
    
    console.log('\n=== All tests completed ===');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
