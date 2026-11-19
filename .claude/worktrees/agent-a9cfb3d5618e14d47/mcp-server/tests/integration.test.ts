import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/connection.js';
import { events, projectdocuments, projecttasks, projectspecifications } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import config from '../src/config.js';


describe('MCP Project Hub Integration', () => {
  // Use a real project ID from the database
  const testProjectId = 'ba924193-0335-4080-9fa6-33cd6b81300a';
  
  beforeAll(async () => {
    // Verify database connection
    expect(config.databaseUrl).toBeDefined();
    expect(config.apiKey).toBeDefined();
  });
  
  afterAll(async () => {
    // Cleanup test data
    await db.delete(events).where(eq(events.projectId, testProjectId));
    await db.delete(projectdocuments).where(eq(projectdocuments.projectId, testProjectId));
    await db.delete(projecttasks).where(eq(projecttasks.projectId, testProjectId));
  });
  
  describe('Database Schema', () => {
    it('should have all required tables', async () => {
      // Test that we can query each table
      const eventsResult = await db.select().from(events).limit(1);
      expect(Array.isArray(eventsResult)).toBe(true);
      
      const docsResult = await db.select().from(projectdocuments).limit(1);
      expect(Array.isArray(docsResult)).toBe(true);
      
      const tasksResult = await db.select().from(projecttasks).limit(1);
      expect(Array.isArray(tasksResult)).toBe(true);
    });
  });
  
  describe('Event Capture Workflow', () => {
    it('should capture a chat thread event', async () => {
      const eventData = {
        projectId: testProjectId,
        type: 'chat_thread' as const,
        source: 'vscode',
        actor: 'test-user',
        rawContent: 'User: I need to add user authentication\nAI: I can help with that!',
        normalizedContent: 'Discussion about adding user authentication feature',
        metadata: { intent: 'feature_request', topic: 'authentication' },
      };
      
      const [event] = await db.insert(events).values(eventData).returning();
      
      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.projectId).toBe(testProjectId);
      expect(event.type).toBe('chat_thread');
      expect(event.source).toBe('vscode');
      expect(event.actor).toBe('test-user');
      expect(event.rawContent).toBe(eventData.rawContent);
      expect(event.createdAt).toBeDefined();
      
      // Cleanup
      await db.delete(events).where(eq(events.id, event.id));
    });
    
    it('should capture multiple event types', async () => {
      const eventTypes = [
        { type: 'spec_created' as const, source: 'ai-agent', content: 'Created spec for user auth' },
        { type: 'task_created' as const, source: 'wxAI-pipeline', content: 'Generated 5 tasks from spec' },
        { type: 'commit' as const, source: 'wxAIGit', content: 'feat: add OAuth2 authentication' },
      ];
      
      const createdEvents = [];
      
      for (const eventType of eventTypes) {
        const [event] = await db.insert(events).values({
          projectId: testProjectId,
          type: eventType.type,
          source: eventType.source,
          actor: 'test-system',
          rawContent: eventType.content,
        }).returning();
        
        createdEvents.push(event);
        expect(event.type).toBe(eventType.type);
      }
      
      expect(createdEvents).toHaveLength(3);
      
      // Cleanup
      for (const event of createdEvents) {
        await db.delete(events).where(eq(events.id, event.id));
      }
    });
  });
  
  describe('Document Management Workflow', () => {
    it('should create a spec document', async () => {
      const docData = {
        projectId: testProjectId,
        title: 'User Authentication Specification',
        content: '# User Authentication\n\n## Overview\nThis spec covers OAuth2 implementation...',
        doctype: 'specs',
      };

      
      const [document] = await db.insert(projectdocuments).values(docData).returning();
      
      expect(document).toBeDefined();
      expect(document.id).toBeDefined();
      expect(document.title).toBe(docData.title);
      expect(document.content).toBe(docData.content);
      expect(document.doctype).toBe(docData.doctype);
      expect(document.createdAt).toBeDefined();
      expect(document.updatedAt).toBeDefined();
      
      // Cleanup
      await db.delete(projectdocuments).where(eq(projectdocuments.id, document.id));
    });
    
    it('should update an existing document', async () => {
      // Create initial document
      const [document] = await db.insert(projectdocuments).values({
        projectId: testProjectId,
        title: 'Initial Title',
        content: 'Initial content',
        doctype: 'specs',
      }).returning();


      
      // Update it
      const [updated] = await db.update(projectdocuments)
        .set({
          title: 'Updated Title',
          content: 'Updated content with more details',
          updatedAt: new Date(),
        })
        .where(eq(projectdocuments.id, document.id))
        .returning();
      
      expect(updated.title).toBe('Updated Title');
      expect(updated.content).toBe('Updated content with more details');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(document.updatedAt.getTime());
      
      // Cleanup
      await db.delete(projectdocuments).where(eq(projectdocuments.id, document.id));
    });
  });
  
  describe('Task Management Workflow', () => {
    it('should create a task from spec', async () => {
      // First create an event (simulating the spec creation)
      const [event] = await db.insert(events).values({
        projectId: testProjectId,
        type: 'spec_created',
        source: 'wxAI-pipeline',
        actor: 'ai-agent',
        rawContent: 'Created spec for user authentication',
      }).returning();
      
      // Then create a task
      const [task] = await db.insert(projecttasks).values({
        projectId: testProjectId,
        name: 'Implement OAuth2 Provider',
        description: 'Set up OAuth2 authentication with Google and GitHub providers',
        status: 'open',
        priority: 'high',
      }).returning();
      
      expect(task).toBeDefined();
      expect(task.name).toBe('Implement OAuth2 Provider');
      expect(task.status).toBe('open');
      
      // Cleanup
      await db.delete(projecttasks).where(eq(projecttasks.id, task.id));
      await db.delete(events).where(eq(events.id, event.id));
    });
    
    it('should update task status through workflow', async () => {
      // Create task
      const [task] = await db.insert(projecttasks).values({
        projectId: testProjectId,
        name: 'Test Task',
        description: 'A task to test status updates',
        status: 'open',
        priority: 'medium',
      }).returning();
      
      // Update to in_progress
      const [inProgress] = await db.update(projecttasks)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(projecttasks.id, task.id))
        .returning();
      
      expect(inProgress.status).toBe('in_progress');
      
      // Update to done
      const [done] = await db.update(projecttasks)
        .set({ status: 'done', updatedAt: new Date() })
        .where(eq(projecttasks.id, task.id))
        .returning();
      
      expect(done.status).toBe('done');
      
      // Cleanup
      await db.delete(projecttasks).where(eq(projecttasks.id, task.id));
    });
  });
  
  describe('Document-Task Linking', () => {
    it('should link documents and tasks via specId', async () => {
      // Create a spec in projectspecifications first (for FK constraint)
      const [spec] = await db.insert(projectspecifications).values({
        projectId: testProjectId,
        specNumber: '001',
        title: 'API Design Spec',
        content: '# API Design\n\nEndpoints...',
        status: 'draft',
      }).returning();
      
      // Create task linked to the spec
      const [task] = await db.insert(projecttasks).values({
        projectId: testProjectId,
        specId: spec.id,
        name: 'Implement API Endpoints',
        description: 'Implement the REST API endpoints per design doc',
        status: 'open',
      }).returning();
      
      expect(task.specId).toBe(spec.id);
      
      // Cleanup
      await db.delete(projecttasks).where(eq(projecttasks.id, task.id));
      await db.delete(projectspecifications).where(eq(projectspecifications.id, spec.id));
    });
  });

  
  describe('Full Workflow Simulation', () => {
    it('should simulate complete chat-to-tasks workflow', async () => {
      const createdIds: { events: string[], documents: string[], tasks: string[] } = {
        events: [],
        documents: [],
        tasks: [],
      };
      let spec: { id: string } | undefined;
      
      try {

        // Step 1: Capture chat event
        const [chatEvent] = await db.insert(events).values({
          projectId: testProjectId,
          type: 'chat_thread',
          source: 'vscode',
          actor: 'developer',
          rawContent: 'User: I need to add user authentication with OAuth2\nAI: Great! Let me create a scope for this.',
        }).returning();
        createdIds.events.push(chatEvent.id);
        
        // Step 2: Create scope document
        const [scopeDoc] = await db.insert(projectdocuments).values({
          projectId: testProjectId,
          title: 'User Authentication Scope',
          content: '# Scope: OAuth2 Authentication\n\n## Requirements\n- Google OAuth\n- GitHub OAuth\n- JWT tokens\n- Session management',
          doctype: 'scope',
        }).returning();
        createdIds.documents.push(scopeDoc.id);
        
        // Step 3: Capture spec creation event
        const [specEvent] = await db.insert(events).values({
          projectId: testProjectId,
          type: 'spec_created',
          source: 'wxAI-pipeline',
          actor: 'ai-agent',
          rawContent: 'Created spec.md from scope document',
        }).returning();
        createdIds.events.push(specEvent.id);
        
        // Step 4: Create spec in projectspecifications
        const [createdSpec] = await db.insert(projectspecifications).values({

          projectId: testProjectId,
          specNumber: '001',
          title: 'User Authentication Specification',
          content: '# Specification\n\nDetailed technical specification...',
          status: 'draft',
        }).returning();
        
        // Also create a spec document
        const [specDoc] = await db.insert(projectdocuments).values({
          projectId: testProjectId,
          title: 'User Authentication Specification',
          content: '# Specification\n\nDetailed technical specification...',
          doctype: 'specs',
        }).returning();

        createdIds.documents.push(specDoc.id);
        
        // Step 5: Create tasks from spec
        const taskData = [
          { name: 'Set up OAuth2 providers', priority: 'high' },
          { name: 'Implement JWT token generation', priority: 'high' },
          { name: 'Create login/logout endpoints', priority: 'medium' },
        ];
        
        for (const task of taskData) {
          const [createdTask] = await db.insert(projecttasks).values({
            projectId: testProjectId,
          specId: createdSpec.id,

            name: task.name,
            description: `Task from spec: ${task.name}`,
            priority: task.priority as any,
            status: 'open',
          }).returning();
          createdIds.tasks.push(createdTask.id);
        }

        
        // Step 6: Query open items
        const openTasks = await db.select()
          .from(projecttasks)
          .where(eq(projecttasks.projectId, testProjectId));
        
        const recentDocs = await db.select()
          .from(projectdocuments)
          .where(eq(projectdocuments.projectId, testProjectId));
        
        const recentEvents = await db.select()
          .from(events)
          .where(eq(events.projectId, testProjectId));
        
        // Verify workflow results
        expect(openTasks.length).toBeGreaterThanOrEqual(3);
        expect(recentDocs.length).toBeGreaterThanOrEqual(2);
        expect(recentEvents.length).toBeGreaterThanOrEqual(2);
        
        // Verify task statuses
        const ourTasks = openTasks.filter(t => createdIds.tasks.includes(t.id));
        expect(ourTasks).toHaveLength(3);
        const allOpen = ourTasks.every(t => t.status === 'open');
        expect(allOpen).toBe(true);
        
        // Verify spec linking
        const linkedTasks = ourTasks.filter(t => t.specId === createdSpec.id);
        expect(linkedTasks).toHaveLength(3);
        
        spec = createdSpec;
        
      } finally {
        // Cleanup all created data
        for (const taskId of createdIds.tasks) {
          await db.delete(projecttasks).where(eq(projecttasks.id, taskId));
        }
        for (const docId of createdIds.documents) {
          await db.delete(projectdocuments).where(eq(projectdocuments.id, docId));
        }
        // Cleanup spec
        if (spec) {
          await db.delete(projectspecifications).where(eq(projectspecifications.id, spec.id));
        }

        for (const eventId of createdIds.events) {

          await db.delete(events).where(eq(events.id, eventId));
        }
      }
    });
  });
});
