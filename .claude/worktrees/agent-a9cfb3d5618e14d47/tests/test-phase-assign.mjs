// Test script for phase assignment API
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
const LOGIN_URL = `${BASE_URL}/api/auth/signin`;
const PROJECTS_URL = `${BASE_URL}/api/projects`;


const credentials = {
  email: 'devteam@alitho.com',
  password: '$ccsCowboy007'
};
 

async function login() {
  console.log('Logging in...');
  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed: ${error}`);
  }
  
  const data = await response.json();
  console.log('Login successful, token received');
  return data.token;
}

async function getProjects(token) {
  console.log('\nFetching projects...');
  const response = await fetch(PROJECTS_URL, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get projects: ${error}`);
  }
  
  const data = await response.json();
  console.log(`Found ${data.projects?.length || 0} projects`);
  return data.projects;
}

async function getProjectPhases(token, projectId) {
  console.log(`\nFetching phases for project ${projectId}...`);
  const response = await fetch(`${PROJECTS_URL}/${projectId}/phases`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get phases: ${error}`);
  }
  
  const data = await response.json();
  console.log(`Found ${data.phases?.length || 0} phases`);
  return data.phases;
}

async function assignPhase(token, projectId, phaseId, assignedUserId) {
  console.log(`\nAssigning phase ${phaseId} to user ${assignedUserId}...`);
  const response = await fetch(`${PROJECTS_URL}/${projectId}/phases/${phaseId}/assign`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ assigneduserid: assignedUserId })
  });
  
  console.log(`Response status: ${response.status}`);
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`Assignment failed: ${error}`);
    return false;
  }
  
  const data = await response.json();
  console.log('Assignment successful:', data);
  return true;
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
    const error = await response.text();
    throw new Error(`Failed to get team members: ${error}`);
  }
  
  const data = await response.json();
  console.log(`Found ${data.members?.length || 0} team members`);
  return data.members;
}

async function runTests() {
  try {
    // Login
    const token = await login();
    
    // Get projects
    const projects = await getProjects(token);
    if (!projects || projects.length === 0) {
      console.log('No projects found. Please create a project first.');
      return;
    }
    
    const project = projects[0];
    console.log(`Using project: ${project.name} (${project.id})`);
    
    // Get phases
    const phases = await getProjectPhases(token, project.id);
    if (!phases || phases.length === 0) {
      console.log('No phases found for this project.');
      return;
    }
    
    const phase = phases[0];
    console.log(`Using phase: ${phase.phasename} (${phase.id})`);
    
    // Get team members
    const members = await getTeamMembers(token);
    if (!members || members.length === 0) {
      console.log('No team members found.');
      return;
    }
    
    const member = members[0];
    console.log(`Using team member: ${member.fullname || member.email} (${member.userid})`);
    
    // Test 1: Assign a user to a phase
    console.log('\n=== Test 1: Assign user to phase ===');
    const assignResult = await assignPhase(token, project.id, phase.id, member.userid);
    
    // Test 2: Unassign (set to null)
    console.log('\n=== Test 2: Unassign user from phase ===');
    const unassignResult = await assignPhase(token, project.id, phase.id, null);
    
    // Test 3: Unassign (set to empty string)
    console.log('\n=== Test 3: Unassign with empty string ===');
    const unassignEmptyResult = await assignPhase(token, project.id, phase.id, '');
    
    console.log('\n=== All tests completed ===');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
